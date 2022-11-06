//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import {UUPSProxiable} from "./upgradability/UUPSProxiable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolV1} from "./interfaces/IPool-V1.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

/****************************************************************************************************
 * @title Pool Implmentation (User=supplier interaction)
 * @dev This contract provides the ability to send supertokens via single transactions or streaming.
 *      The state within the contract will be updated every time a "pool event"
 *      (yield accrued updated, start/stop stream/ deposit/withdraw, ertc..) happen. Every pool event
 *      a new pool state will be stored
 *
 *      The supplier interact with this contract. The state and the logic is inside a contract PoolInternal.
 *      After a pool envent is trigerred the pool contract call a "twin" method in the pool internal contract
 *
 *      The update Process follows:
 *      1) Pool Contract: Pool Events (external triggered)
 *      2) Pool Internal Contract: Pool Update, Pool state updated, index calculations from previous pool
 *      3) Pool Internal Contract: Supplier Update State (User deòsitimg/withdrawing, etc.. )
 *      4) Pool Internal Contract:New created pool updated
 *
 ****************************************************************************************************/
contract PoolV1 is UUPSProxiable, ERC20Upgradeable, SuperAppBase, IERC777Recipient, IPoolV1 {
  // #region pool state

  using SafeMath for uint256;

  address public owner;
  address public poolFactory;

  ISuperfluid public host; // host
  IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address

  ISuperToken superToken;
  IERC20 token;


  using CFAv1Library for CFAv1Library.InitData;
  CFAv1Library.InitData internal _cfaLib;

  IOps public ops;
  address payable public gelato;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint256 MAX_INT;

  uint256 public PRECISSION;

  uint256 public SUPERFLUID_DEPOSIT;
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public MIN_OUTFLOW_ALLOWED; // 1 hour minimum flow == Buffer

  uint256 public DEPOSIT_TRIGGER_AMOUNT;
  uint256 public BALANCE_TRIGGER_TIME;

  uint256 public lastExecution;

  uint256 public PROTOCOL_FEE;

  IPoolStrategyV1 poolStrategy;
  IPoolInternalV1 poolInternal;



  // #endregion pool state

  /**
   * @notice initializer of the Pool
   */
  function initialize(DataTypes.PoolInitializer memory poolInit) external initializer {
    ///initialState
    __ERC20_init(poolInit.name, poolInit.symbol);
    //// super app && superfluid
    host = poolInit.host;
    owner = poolInit.owner;
    superToken = poolInit.superToken;

    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
    token = poolInit.token;
    owner = poolInit.owner;
    poolFactory = msg.sender;

    MAX_INT = 2**256 - 1;

    _cfaLib = CFAv1Library.InitData(host, cfa);

    //// tokens receie implementation
    IERC1820Registry _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));

    ///// initializators

    poolStrategy = IPoolStrategyV1(poolInit.poolStrategy);
    poolInternal = IPoolInternalV1(poolInit.poolInternal);

    ops = poolInit.ops;

    gelato = ops.gelato();

    token.approve(address(poolStrategy), MAX_INT);
    superToken.approve(address(poolStrategy), MAX_INT);

    PRECISSION = 1_000_000;
    MIN_OUTFLOW_ALLOWED = 3600; // 1 hour minimum flow == Buffer

    STEPS = 10;
    POOL_BUFFER = 3600; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
    SUPERFLUID_DEPOSIT = 4 * 3600;

    DEPOSIT_TRIGGER_AMOUNT = 100 ether;
    BALANCE_TRIGGER_TIME = 3600 * 24;

    PROTOCOL_FEE = 3;
  }

  // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //
  /****************************************************************************************************
   * @notice Supplier (User) interaction
   * @dev Following interactions are expected:
   *
   * ---- tokensReceived()
   *      implementation callback tokensReceived(). Deposit funds via erc777.send() function.
   *
   * ---- RedeemDeposit() User withdraw funds from his balalce SuperTokens will be ransfered
   *
   *
   * ---- redeemFlow() User request a stream from the pool (this balance will be reduced)
   *
   * ---- redeemFlowStop() User stops receiving stream from the pool
   *
   * ---- closeAcount User receives the complete balance and streams will be closed
   *
   ****************************************************************************************************/

  /**
   * @notice ERC277 call back allowing deposit tokens via .send()
   * @param from Supplier (user sending tokens)
   * @param amount amount received
   */
  function tokensReceived(
    address operator,
    address from,
    address to,
    uint256 amount,
    bytes calldata userData,
    bytes calldata operatorData
  ) external override(IERC777Recipient, IPoolV1) {
    require(msg.sender == address(superToken), "INVALID_TOKEN");
    require(amount > 0, "AMOUNT_TO_BE_POSITIVE");

    poolInternal._tokensReceived(from, amount);

    emitEvents(from);

    bytes memory payload = abi.encode(amount);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.DEPOSIT, payload, block.timestamp, from);
  }

  /**
   * @notice User redeem deposit (withdraw)
   * @param redeemAmount amount to be reddemed
   */
  function redeemDeposit(uint256 redeemAmount) external override {
    address _supplier = msg.sender;

    poolInternal._redeemDeposit(redeemAmount, _supplier);

    emitEvents(_supplier);

    bytes memory payload = abi.encode(redeemAmount);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW, payload, block.timestamp, _supplier);
  }

  /**
   * @notice User starts a flow to be
   * @param _outFlowRate outflowrate to receive from the pool
   *
   ***    This method can be called to create a stream or update a previous one
   */
  function redeemFlow(int96 _outFlowRate) external {
    address _supplier = msg.sender;

    uint256 realTimeBalance = balanceOf(_supplier);

    ///
    require(realTimeBalance > 0, "NO_BALANCE");

    DataTypes.Supplier memory supplier = poolInternal.getSupplier(_supplier);

    DataTypes.SupplierEvent flowEvent = supplier.outStream.flow > 0 ? DataTypes.SupplierEvent.OUT_STREAM_UPDATE : DataTypes.SupplierEvent.OUT_STREAM_START;

    poolInternal._redeemFlow(_outFlowRate, _supplier);

    emitEvents(_supplier);

    bytes memory payload = abi.encode(_outFlowRate);
    emit Events.SupplierEvent(flowEvent, payload, block.timestamp, _supplier);
  }

  /**
   * @notice User stop the receiving stream
   *
   */
  function redeemFlowStop() external {
    address _supplier = msg.sender;

    DataTypes.Supplier memory supplier = poolInternal.getSupplier(_supplier);

    require(supplier.outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

    poolInternal._redeemFlowStop(_supplier);

    emitEvents(_supplier);

    bytes memory payload = abi.encode("");
    emit Events.SupplierEvent(DataTypes.SupplierEvent.OUT_STREAM_STOP, payload, block.timestamp, _supplier);
  }

  /**
   * @notice User withdraw all funds and close streams
   *
   */
  function closeAccount() external {}

  // #endregion User Interaction PoolEvents

  // #region  ============= =============  ERC20  ============= ============= //
  /****************************************************************************************************
   * @notice ERC20 overrides
   *
   * ---- balanceOf
   * ---- _transfer
   * ---- _getSupplierBalance
   * ---- totalSupply()
   *
   ****************************************************************************************************/

  function balanceOf(address _supplier) public view override(ERC20Upgradeable, IPoolV1) returns (uint256 balance) {
    balance = _getSupplierBalance(_supplier).div(PRECISSION);
  }

  function _getSupplierBalance(address _supplier) internal view returns (uint256 realtimeBalance) {
    DataTypes.Supplier memory supplier = poolInternal.getSupplier(_supplier);

    uint256 yieldSupplier = poolInternal.totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

    int96 netFlow = supplier.inStream - supplier.outStream.flow;

    if (netFlow >= 0) {
      realtimeBalance = yieldSupplier + (supplier.deposit) + uint96(netFlow) * (block.timestamp - supplier.timestamp) * PRECISSION;
    } else {
      realtimeBalance = yieldSupplier + (supplier.deposit) - uint96(supplier.outStream.flow) * (block.timestamp - supplier.timestamp) * PRECISSION;
    }
  }

  function _transfer(
    address from,
    address to,
    uint256 amount
  ) internal virtual override {
    require(from != address(0), "ERC20: transfer from the zero address");
    require(to != address(0), "ERC20: transfer to the zero address");

    _beforeTokenTransfer(from, to, amount);

    uint256 fromBalance = balanceOf(from);
    require(fromBalance >= amount, "NOT_ENOUGH_BALANCE");

    DataTypes.Supplier memory supplier = poolInternal.getSupplier(from);

    //TODO MIN BALANCE

    // uint256 max_allowed = fromBalance.sub(supplier.outStream.minBalance);

    // require(amount <= max_allowed, "NOT_ENOUGH_BALANCE:WITH_OUTFLOW");

    poolInternal.transferSTokens(from, to, amount);

    emit Transfer(from, to, amount);

    _afterTokenTransfer(from, to, amount);

    bytes memory payload = abi.encode(from, amount);

    emitEvents(from);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.TRANSFER, payload, block.timestamp, from);

    DataTypes.Supplier memory toSupplier = poolInternal.getSupplier(to);
    emit Events.SupplierUpdate(toSupplier);
  }

  function totalSupply() public view override(ERC20Upgradeable, IPoolV1) returns (uint256) {
    DataTypes.PoolV1 memory lastPool = poolInternal.getLastPool();
    uint256 periodSpan = block.timestamp - lastPool.timestamp;
    uint256 _totalSupply = lastPool.deposit + uint96(lastPool.inFlowRate) * periodSpan - uint96(lastPool.outFlowRate) * periodSpan;

    return _totalSupply;
  }

  // #endregion overriding ERC20

  // #region========== Superfluid manipulation and Super App Calbacks  ============= ============= //

  function sfCreateFlow(address receiver, int96 newOutFlow) external override onlyPoolInternal {
    _cfaLib.createFlow(receiver, superToken, newOutFlow);
  }

  function sfUpdateFlow(address receiver, int96 newOutFlow) external override onlyPoolInternal {
    _cfaLib.updateFlow(receiver, superToken, newOutFlow);
  }

  function sfDeleteFlow(address sender, address receiver) external override onlyPoolInternal {
    _cfaLib.deleteFlow(sender, receiver, superToken);
  }

  /// when the user send a stream in the case that he is already receiving a stream from the pool
  /// this action will stop the pool outgoing stream, as this action is triggered by the after create
  /// call
  function sfDeleteFlowWithCtx(
    bytes calldata _ctx,
    address sender,
    address receiver
  ) external override returns (bytes memory newCtx) {
    newCtx = _cfaLib.deleteFlowWithCtx(_ctx, sender, receiver, superToken);
  }

  function afterAgreementCreated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32, // _agreementId,
    bytes calldata _agreementData,
    bytes calldata, // _cbdata,
    bytes calldata _ctx
  ) external override onlyExpected(_superToken, _agreementClass) onlyHost returns (bytes memory newCtx) {
    newCtx = _ctx;

    (address sender, address receiver) = abi.decode(_agreementData, (address, address));

    (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

    //// If In-Stream we will request a pool update

    if (receiver == address(this)) {
      newCtx = poolInternal.updateStreamRecord(newCtx, inFlowRate, sender);

      emitEvents(sender);
      bytes memory payload = abi.encode(inFlowRate);
      emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_START, payload, block.timestamp, sender);
    }
    return newCtx;
  }

  ///// NOT YET FINAL IMPLEMNTATION
  function afterAgreementTerminated(
    ISuperToken, /*superToken*/
    address, /*agreementClass*/
    bytes32, // _agreementId,
    bytes calldata _agreementData,
    bytes calldata, /*cbdata*/
    bytes calldata _ctx
  ) external virtual override returns (bytes memory newCtx) {
    (address sender, address receiver) = abi.decode(_agreementData, (address, address));
    newCtx = _ctx;

    //// If In-Stream we will request a pool update
    if (receiver == address(this)) {
      newCtx = poolInternal.updateStreamRecord(newCtx, 0, sender);
      emitEvents(sender);
      bytes memory payload = abi.encode("");
      emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_STOP, payload, block.timestamp, sender);
    } else if (sender == address(this)) {
      console.log("OUT_STREAM_MANUAL_STOPPED");
      poolInternal._redeemFlowStop(receiver);
      emitEvents(receiver);
      bytes memory payload = abi.encode("");
      emit Events.SupplierEvent(DataTypes.SupplierEvent.OUT_STREAM_STOP, payload, block.timestamp, receiver);
    }

    return newCtx;
  }

  function afterAgreementUpdated(
    ISuperToken _superToken,
    address _agreementClass,
    bytes32, // _agreementId,
    bytes calldata _agreementData,
    bytes calldata, //_cbdata,
    bytes calldata _ctx
  ) external override onlyExpected(_superToken, _agreementClass) onlyHost returns (bytes memory newCtx) {
    newCtx = _ctx;

    (address sender, address receiver) = abi.decode(_agreementData, (address, address));

    console.log(receiver);

    (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

    // If In-Stream we will request a pool update
    if (receiver == address(this)) {
      newCtx = poolInternal.updateStreamRecord(newCtx, inFlowRate, sender);
      console.log(431);
      emitEvents(sender);
      console.log(432);
      bytes memory payload = abi.encode("");
      console.log(435);
      emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_UPDATE, payload, block.timestamp, sender);
      console.log(437);
    }
    console.logBytes(newCtx);
    return newCtx;
  }

  function _isCFAv1(address agreementClass) private view returns (bool) {
    return ISuperAgreement(agreementClass).agreementType() == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }

  function _isSameToken(ISuperToken _superToken) private view returns (bool) {
    return address(_superToken) == address(superToken);
  }

  // #endregion Superfluid manipulation and Super App Calbacks

  // #region =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

  function getLastTimestamp() external view override returns (uint256) {
    return poolInternal.getLastTimestamp();
  }

  function getPool(uint256 timestamp) external view override returns (DataTypes.PoolV1 memory) {
    return poolInternal.getPool(timestamp);
  }

  function getLastPool() external view override returns (DataTypes.PoolV1 memory) {
    return poolInternal.getLastPool();
  }

  function getSupplier(address _supplier) external view override returns (DataTypes.Supplier memory) {
    return poolInternal.getSupplier(_supplier);
  }

  function getPrecission() external view returns (uint256) {
    return PRECISSION;
  }

  function getSuperfluidDeposit() external view returns (uint256) {
    return SUPERFLUID_DEPOSIT;
  }

  function getSteps() external view returns (uint8) {
    return STEPS;
  }

  function getPoolBuffer() external view returns (uint256) {
    return POOL_BUFFER;
  }

  function getDepositTriggerAmount() external view returns (uint256) {
    return DEPOSIT_TRIGGER_AMOUNT;
  }

  function getDepositTriggerTime() external view returns (uint256) {
    return BALANCE_TRIGGER_TIME;
  }

  function getProtocolFee() external view returns (uint256) {
    return PROTOCOL_FEE;
  }

  function getVersion() external pure returns (uint256) {
    return 1;
  }

  // #endregion =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

  // #region  ============= =============  Internal && Pool Internal Functions   ============= ============= //

  function transferSuperToken(address receiver, uint256 amount) external override onlyPoolInternal {
    IERC20(address(superToken)).transfer(receiver, amount);
  }

  function internalPushToAAVE(uint256 amount) external override onlyPoolInternal {
    bytes memory payload = abi.encode(amount);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW, payload, block.timestamp, address(0));
  }

  function internalWithDrawStep(address supplier, uint256 stepAmount) external override onlyPoolInternal {
    bytes memory payload = abi.encode(stepAmount);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW, payload, block.timestamp, supplier);
    DataTypes.Supplier memory supplier = poolInternal.getSupplier(supplier);
    emit Events.SupplierUpdate(supplier);
    DataTypes.PoolV1 memory pool = poolInternal.getLastPool();
    emit Events.PoolUpdate(pool);
  }

  function transfer(uint256 _amount, address _paymentToken) external override onlyPoolStrategyOrInternal {
    _transfer(_amount, _paymentToken);
  }

  function emitEvents(address _supplier) internal {
    DataTypes.Supplier memory supplier = poolInternal.getSupplier(_supplier);
    emit Events.SupplierUpdate(supplier);
    DataTypes.PoolV1 memory pool = poolInternal.getLastPool();
    emit Events.PoolUpdate(pool);
  }

  function _transfer(uint256 _amount, address _paymentToken) internal {
    if (_paymentToken == ETH) {
      (bool success, ) = gelato.call{value: _amount}("");
      require(success, "_transfer: ETH transfer failed");
    } else {
      SafeERC20.safeTransfer(IERC20(_paymentToken), gelato, _amount);
    }
  }

  // #endregion  ============= =============  Internal && Pool Internal Functions    ============= ============= //

  // #region =========== =============  PARAMETERS ONLY OWNER  ============= ============= //

  function setPrecission(uint256 _precission) external onlyOwner {
    PRECISSION = _precission;
  }

  function setPoolBuffer(uint256 _poolBuffer) external onlyOwner {
    POOL_BUFFER = _poolBuffer;
  }

  function setSuperfluidDeposit(uint256 _superfluidDeposit) external onlyOwner {
    SUPERFLUID_DEPOSIT = _superfluidDeposit;
  }

  function setSteps(uint8 _steps) external onlyOwner {
    require(_steps <= 20, "MAX_20_STEPS");
    STEPS = _steps;
  }

  function setDepositTriggerAmount(uint256 _amount) external onlyOwner {
    DEPOSIT_TRIGGER_AMOUNT = _amount;
  }

  function setDepositTriggerTime(uint256 _time) external onlyOwner {
    BALANCE_TRIGGER_TIME = _time;
  }

  // #endregion =========== =============  PARAMETERS ONLY OWNER  ============= ============= //

  // #region  ==================  Upgradeable settings  ==================

  function proxiableUUID() public pure override returns (bytes32) {
    return keccak256("org.super-pool.pool.v2");
  }

  function updateCode(address newAddress) external override onlyOwnerOrPoolFactory {
    return _updateCodeAddress(newAddress);
  }

  // #endregion  ==================  Upgradeable settings  ==================

  // #region =========== =============  Modifiers ============= ============= //

  modifier onlyHost() {
    require(msg.sender == address(host), "RedirectAll: support only one host");
    _;
  }

  modifier onlyExpected(ISuperToken _superToken, address agreementClass) {
    require(_isSameToken(_superToken), "RedirectAll: not accepted token");
    require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
    _;
  }

  modifier onlyPoolStrategyOrInternal() {
    require(msg.sender == address(poolStrategy) || msg.sender == address(poolInternal), "Only Internal or Strategy");
    _;
  }

  modifier onlyPoolStrategy() {
    require(msg.sender == address(poolStrategy), "Only Strategy");
    _;
  }

  modifier onlyOwnerOrPoolFactory() {
    require(msg.sender == poolFactory || msg.sender == owner, "Only Factory or owner");
    _;
  }

  modifier onlyPoolInternal() {
    require(msg.sender == address(poolInternal), "Only Internal");
    _;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Only Owner");
    _;
  }

  receive() external payable {
    console.log("----- receive:", msg.value);
  }

  function withdraw() external onlyOwner returns (bool) {
    (bool result, ) = payable(msg.sender).call{value: address(this).balance}("");
    return result;
  }

  // endregion
}
