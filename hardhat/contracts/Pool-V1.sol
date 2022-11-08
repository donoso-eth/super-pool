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
import {LibDataTypes} from "./gelato/LibDataTypes.sol";

import {IPoolV1} from "./interfaces/IPool-V1.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import {PoolStateV1} from "./PoolState-V1.sol";

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
contract PoolV1 is PoolStateV1, UUPSProxiable, ERC20Upgradeable, SuperAppBase, IERC777Recipient, IPoolV1 {
  using SafeMath for uint256;
  using CFAv1Library for CFAv1Library.InitData;

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

    ops = poolInit.ops;
    gelato = ops.gelato();

    PRECISSION = 1_000_000;
    MIN_OUTFLOW_ALLOWED = 24 * 3600; // 1 Day minimum flow == Buffer

    POOL_BUFFER = 3600; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
    SUPERFLUID_DEPOSIT = 4 * 3600;

    DEPOSIT_TRIGGER_AMOUNT = 100 ether;
    BALANCE_TRIGGER_TIME = 3600 * 24;

    PROTOCOL_FEE = 3;

    poolStrategy = address(poolInit.poolStrategy);
    poolInternal = poolInit.poolInternal;

    token.approve(address(poolStrategy), MAX_INT);
    superToken.approve(address(poolStrategy), MAX_INT);

    lastPoolTimestamp = block.timestamp;
    poolByTimestamp[block.timestamp] = DataTypes.PoolV1(0, block.timestamp, 0, 0, 0, 0, 0, 0, 0, DataTypes.Yield(0, 0, 0, 0, 0, 0, 0), DataTypes.APY(0, 0));
    lastExecution = block.timestamp;
  
    bytes memory data = callInternal(abi.encodeWithSignature("_createBalanceTreasuryTask()"));

    balanceTreasuryTask = abi.decode(data, (bytes32)); // createBalanceTreasuryTask();
 
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

    callInternal(abi.encodeWithSignature("_tokensReceived(address,uint256)", from, amount));

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

    //  poolInternal._redeemDeposit(redeemAmount, _supplier);
    callInternal(abi.encodeWithSignature("_redeemDeposit(address,uint256)", _supplier, redeemAmount));

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

    DataTypes.SupplierEvent flowEvent = suppliersByAddress[_supplier].outStream.flow > 0 ? DataTypes.SupplierEvent.OUT_STREAM_UPDATE : DataTypes.SupplierEvent.OUT_STREAM_START;

    bytes memory data = callInternal(abi.encodeWithSignature("_redeemFlow(address,int96)", _supplier, _outFlowRate));

    emitEvents(_supplier);

    bytes memory payload = abi.encode(_outFlowRate);
    emit Events.SupplierEvent(flowEvent, payload, block.timestamp, _supplier);
  }

  function taskClose(address _supplier) external onlyOps {
    (uint256 fee, address feeToken) = IOps(ops).getFeeDetails();

    transfer(fee, feeToken);
    callInternal(abi.encodeWithSignature("closeStreamFlow(address)", _supplier));

  }

  function callInternal(bytes memory payload) internal returns (bytes memory) {

    (bool success, bytes memory data) = poolInternal.delegatecall(payload);
   
     if (!success) {
      if (data.length < 68) revert();
      assembly {
        data := add(data, 0x04)
      }
      revert(abi.decode(data, (string)));
    } else {
      return data;
    }
  }

  /**
   * @notice User stop the receiving stream
   *
   */
  function redeemFlowStop() external {
    address _supplier = msg.sender;

    require(suppliersByAddress[_supplier].outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

    callInternal(abi.encodeWithSignature("_redeemFlowStop(address)", _supplier));

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
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

    uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier, IPoolStrategyV1(poolStrategy).balanceOf());

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

    DataTypes.Supplier memory supplier = suppliersByAddress[from];

    //TODO MIN BALANCE

    callInternal(abi.encodeWithSignature("transferSTokens(address,address,uint256)", from, to, amount));

    emit Transfer(from, to, amount);

    _afterTokenTransfer(from, to, amount);

    bytes memory payload = abi.encode(from, amount);

    emitEvents(from);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.TRANSFER, payload, block.timestamp, from);

    DataTypes.Supplier memory toSupplier = suppliersByAddress[to];
    emit Events.SupplierUpdate(toSupplier);
  }

  function totalSupply() public view override(ERC20Upgradeable, IPoolV1) returns (uint256) {
    DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];
    uint256 periodSpan = block.timestamp - lastPool.timestamp;
    uint256 _totalSupply = lastPool.deposit + uint96(lastPool.inFlowRate) * periodSpan - uint96(lastPool.outFlowRate) * periodSpan;

    return _totalSupply;
  }

  // #endregion overriding ERC20

  ///// REGION SUPERFLUID
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
      newCtx = _updateStreamRecord(newCtx, inFlowRate, sender);

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
      newCtx = _updateStreamRecord(newCtx, 0, sender);
      emitEvents(sender);
      bytes memory payload = abi.encode("");
      emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_STOP, payload, block.timestamp, sender);
    } else if (sender == address(this)) {
    
      // poolInternal._redeemFlowStop(receiver);
      callInternal(abi.encodeWithSignature("_redeemFlowStop(address)", receiver));

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

    (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

    // If In-Stream we will request a pool update
    if (receiver == address(this)) {
      newCtx = _updateStreamRecord(newCtx, inFlowRate, sender);

      emitEvents(sender);

      bytes memory payload = abi.encode("");

      emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_UPDATE, payload, block.timestamp, sender);
    }

    return newCtx;
  }

  function _updateStreamRecord(
    bytes memory newCtx,
    int96 inFlowRate,
    address sender
  ) internal returns (bytes memory updateCtx) {
    // updateCtx = _updateSupplierFlow(sender, inFlowRate, 0, newCtx);

    bytes memory data = callInternal(abi.encodeWithSignature("_updateSupplierFlow(address,int96,int96,bytes)", sender, inFlowRate, 0, newCtx));

    updateCtx = abi.decode(data, (bytes));
  }

  function _isCFAv1(address agreementClass) private view returns (bool) {
    return ISuperAgreement(agreementClass).agreementType() == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }

  function _isSameToken(ISuperToken _superToken) private view returns (bool) {
    return address(_superToken) == address(superToken);
  }

  // #endregion Superfluid manipulation and Super App Calbacks

  // #region =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

  function balanceTreasury() external onlyOps {
    require(block.timestamp >= lastExecution + BALANCE_TRIGGER_TIME, "NOT_YER_READY");
   
    (uint256 fee, address feeToken) = IOps(ops).getFeeDetails();
 
    transfer(fee, feeToken);
    }

  function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier) {
    supplier = suppliersByAddress[_supplier];
  }

  function getPool(uint256 timestamp) external view returns (DataTypes.PoolV1 memory pool) {
    pool = poolByTimestamp[timestamp];
  }

  function getLastPool() external view returns (DataTypes.PoolV1 memory pool) {
    pool = poolByTimestamp[lastPoolTimestamp];
  }

  function getLastTimestamp() external view returns (uint256) {
    return lastPoolTimestamp;
  }

  function getVersion() external pure returns (uint256) {
    return 1;
  }

  // #endregion =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

  // #region  ============= =============  Internal && Pool Internal Functions   ============= ============= //

  function transfer(uint256 _amount, address _paymentToken) internal {
    // _transfer(_amount, _paymentToken);
    // callInternal(abi.encodeWithSignature("_transfer(uint256,address)", _amount, _paymentToken));
    (bool success, ) = gelato.call{value: _amount}("");
    require(success, "_transfer: ETH transfer failed");
  }

  // function _transfer(uint256 _amount, address _paymentToken) internal {
  //     (bool success, ) = gelato.call{value: _amount}("");
  //     require(success, "_transfer: ETH transfer failed");
  // }

  function emitEvents(address _supplier) internal {
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];
    emit Events.SupplierUpdate(supplier);
    DataTypes.PoolV1 memory pool = poolByTimestamp[lastPoolTimestamp];
    emit Events.PoolUpdate(pool);
  }

  // #endregion  ============= =============  Internal && Pool Internal Functions    ============= ============= //

  // #region =========== =============  PARAMETERS ONLY OWNER  ============= ============= //

  function setPoolBuffer(uint256 _poolBuffer) external onlyOwner {
    POOL_BUFFER = _poolBuffer;
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

  modifier onlyOps() {
    require(msg.sender == address(ops), "OpsReady: onlyOps");
    _;
  }

  modifier onlyOwnerOrPoolFactory() {
    require(msg.sender == poolFactory || msg.sender == owner, "Only Factory or owner");
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


  /**
   * @notice Calculate the yield earned by the suplier
   * @param _supplier supplier's address
   * @return yieldSupplier uint256 yield erarnd
   *
   * @dev  it calculates the yield between the last pool update and the last supplier interaction
   *       it uses two indexes (per deosit and flow), the yield is (timespan)(diff index's)
   */
  function _calculateYieldSupplier(address _supplier) public view returns (uint256 yieldSupplier) {
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

    DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];
    DataTypes.PoolV1 memory supplierPool = poolByTimestamp[supplier.timestamp];

    ///// Yield from deposit

    uint256 yieldFromDeposit = (supplier.deposit * (lastPool.yieldObject.yieldTokenIndex - supplierPool.yieldObject.yieldTokenIndex)).div(PRECISSION);
    uint256 yieldFromFlow = 0;
    uint256 yieldFromOutFlow = 0;

    yieldSupplier = yieldFromDeposit;
    if (supplier.inStream > 0) {
      ///// Yield from flow
      yieldFromFlow = uint96(supplier.inStream) * (lastPool.yieldObject.yieldInFlowRateIndex - supplierPool.yieldObject.yieldInFlowRateIndex);
    }

    if (supplier.outStream.flow > 0) {
      ///// Yield from flow
      yieldFromOutFlow = uint96(supplier.outStream.flow) * (lastPool.yieldObject.yieldOutFlowRateIndex - supplierPool.yieldObject.yieldOutFlowRateIndex);
    }

    yieldSupplier = yieldSupplier + yieldFromFlow - yieldFromOutFlow;
  }

  function _calculateIndexes(uint256 yieldPeriod, DataTypes.PoolV1 memory lastPool)
    public
    view
    returns (
      uint256 periodYieldTokenIndex,
      uint256 periodYieldInFlowRateIndex,
      uint256 periodYieldOutFlowRateIndex
    )
  {
    uint256 periodSpan = block.timestamp - lastPool.timestamp;

    uint256 dollarSecondsDeposit = lastPool.deposit * periodSpan;
    uint256 dollarSecondsInFlow = ((uint96(lastPool.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromInFlowRate * periodSpan;
    uint256 dollarSecondsOutFlow = ((uint96(lastPool.outFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromOutFlowRate * periodSpan;
    uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow - dollarSecondsOutFlow;

    /// we ultiply by PRECISSION

    if (totalAreaPeriod != 0 && yieldPeriod != 0) {
      uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
      uint256 outFlowContribution = (dollarSecondsOutFlow * PRECISSION);
      uint256 depositContribution = (dollarSecondsDeposit * PRECISSION * PRECISSION);
      if (lastPool.deposit != 0) {
        periodYieldTokenIndex = ((depositContribution * yieldPeriod).div((lastPool.deposit) * totalAreaPeriod));
      }
      if (lastPool.inFlowRate != 0) {
        periodYieldInFlowRateIndex = ((inFlowContribution * yieldPeriod).div(uint96(lastPool.inFlowRate) * totalAreaPeriod));
      }
      if (lastPool.outFlowRate != 0) {
        periodYieldOutFlowRateIndex = ((outFlowContribution * yieldPeriod).div(uint96(lastPool.outFlowRate) * totalAreaPeriod));
      }
    }
  }


  // #endregion pool state

  function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) public view returns (uint256 yieldSupplier) {
    uint256 yieldTilllastPool = _calculateYieldSupplier(_supplier);
    DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];

    uint256 yieldAccruedSincelastPool = 0;
    if (currentYieldSnapshot > lastPool.yieldObject.yieldSnapshot) {
      yieldAccruedSincelastPool = currentYieldSnapshot - lastPool.yieldObject.yieldSnapshot;
    }

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex, uint256 yieldOutFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream) * yieldInFlowRateIndex;
    uint256 yieldOutFlow = uint96(supplier.outStream.flow) * yieldOutFlowRateIndex;

    yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow - yieldOutFlow;
  }

  function checkerLastExecution() external view returns (bool canExec, bytes memory execPayload) {
    canExec = block.timestamp >= lastExecution + BALANCE_TRIGGER_TIME;

    execPayload = abi.encodeWithSelector(this.balanceTreasury.selector);
  }
}
