//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

// import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {ISTokenV2} from "./interfaces/ISToken-V2.sol";
import {IPoolInternalV2} from "./interfaces/IPoolInternal-V2.sol";
import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";
import {IGelatoTasksV2} from "./interfaces/IGelatoTasks-V2.sol";
import {IResolverSettingsV2} from "./interfaces/IResolverSettings-V2.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

/****************************************************************************************************
 * @title PoolFacory
 * @dev This contract provides the ability to deposit supertokens via single transactions or streaming.
 *      The state within the contract will be updated every time a "pool event"
 *      (yield accrued updated, start/stop stream/ deposit/withdraw, ertc..) happened. Every pool event
 *       a new pool state will be stored "period"
 *
 *      The update Process follows:
 *      1) Pool Events (external triggered)
 *      2) Pool Update, Pool state updated, index calculations from previous period
 *      3) Supplier Update State (User deòsitimg/withdrawing, etc.. )
 *      4) New created period Updated
 *
 ****************************************************************************************************/
contract PoolV2 is Initializable, UUPSUpgradeable,SuperAppBase, IERC777Recipient {
  // #region pool state

  using SafeMath for uint256;


  address owner;
  address superHost;

  ISuperfluid public host; // host
  IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address
  ISuperToken superToken;

  using CFAv1Library for CFAv1Library.InitData;
  CFAv1Library.InitData internal _cfaLib;

  uint256 supplierId;

  mapping(address => DataTypes.Supplier) public suppliersByAddress;

  mapping(uint256 => address) supplierAdressById;

  mapping(uint256 => DataTypes.PoolV2) public poolByTimestamp;

  mapping(uint256 => uint256) public poolTimestampById;

  uint256 public lastPoolTimestamp;



  IOps public ops;
  address payable public gelato;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint256 MAX_INT;

  uint256 PRECISSION;

  // 1 hour minimum flow == Buffer
  uint8 public STEPS; // proportinal decrease deposit
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public SUPERFLUID_DEPOSIT;
  uint56 public MIN_OUTFLOW_ALLOWED;

  ISTokenV2 sToken;
  IPoolStrategyV2 poolStrategy;
  IGelatoTasksV2 gelatoTasks;
  IPoolInternalV2 poolInternal;
  IResolverSettingsV2 resolverSettings;

  IERC20 token;

  // #endregion pool state

  //// ERC4626 EVents
  constructor() {}

  /**
   * @notice initializer of the Pool
   */
  function initialize( ISuperfluid _host,
    ISuperToken _superToken,
    IERC20 _token,
    address _owner) external initializer {
    ///initialState

    lastPoolTimestamp = block.timestamp;
    poolByTimestamp[block.timestamp] = DataTypes.PoolV2(0, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

    poolTimestampById[0] = block.timestamp;

    //// super app && superfluid
    host = _host;
    superToken = _superToken;

    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
    token = _token;
    owner = _owner;
    superHost = msg.sender;

   

    //// gelato

  
    MAX_INT = 2**256 - 1;

  
    

    _cfaLib = CFAv1Library.InitData(host, cfa);
  
    //// tokens receie implementation
    IERC1820Registry _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));

   

    ///// initializators
  }

  function initializeAfterSettings(IResolverSettingsV2 _resolverSettings ) external onlySuperHost {
    resolverSettings = IResolverSettingsV2(_resolverSettings);
    sToken = ISTokenV2(resolverSettings.getSToken());
   
    poolStrategy = IPoolStrategyV2(resolverSettings.getPoolStrategy());
    gelatoTasks = IGelatoTasksV2(resolverSettings.getGelatoTasks());
    poolInternal = IPoolInternalV2(resolverSettings.getPoolInternal());
    
    ops = IOps(resolverSettings.getGelatoOps());
    gelato = ops.gelato();

    _cfaLib.authorizeFlowOperatorWithFullControl(address(poolInternal), superToken);

    token.approve(address(poolStrategy), MAX_INT);
    superToken.approve(address(poolStrategy), MAX_INT);

    STEPS = resolverSettings.getSteps();
    SUPERFLUID_DEPOSIT = resolverSettings.getSuperfluidDeposit();
    POOL_BUFFER = resolverSettings.getPoolBuffer();
    MIN_OUTFLOW_ALLOWED = 3600;

  }

  function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

  function getPool(uint256 _timestamp) external view returns (DataTypes.PoolV2 memory) {
    return poolByTimestamp[_timestamp];
  }

  function getLastPool() public view returns (DataTypes.PoolV2 memory) {
    return poolByTimestamp[lastPoolTimestamp];
  }

  // function poolUpdateUser(address user) external {
  //   _poolUpdateCurrentState();
  //   poolInternal._supplierUpdateCurrentState(user);
  // }

  function poolUpdate() external {
    _poolUpdateCurrentState();
  }

  function getSupplierByAdress(address _supplier) external view returns (DataTypes.Supplier memory supplier) {
    return suppliersByAddress[_supplier];
  }

  function transferSTokens(
    address _sender,
    address _receiver,
    uint256 amount
   ) external onlySToken {
    poolInternal._supplierUpdateCurrentState(_sender);
    DataTypes.Supplier  storage sender = _getSupplier(_sender);
       poolInternal._supplierUpdateCurrentState(_receiver);
    DataTypes.Supplier storage receiver = _getSupplier(_sender);

    sender.deposit -= amount;
    receiver.deposit += amount;
  
    bytes  memory payload = abi.encode(_receiver,amount);
    emit Events.SupplierUpdate(sender);
    emit Events.SupplierUpdate(receiver);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.TRANSFER,payload,block.timestamp,msg.sender);

  //   poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + (outDeposit * PRECISSION) - (inDeposit * PRECISSION);
    //_updateSupplierDeposit(_supplier, inDeposit, outDeposit);
  }

  function pushedToStrategy(uint256 amount) external onlyPoolStrategy {

    poolByTimestamp[lastPoolTimestamp].yieldSnapshot += amount;

    bytes  memory payload = abi.encode(amount);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW,payload,block.timestamp,address(0));
  }

  // #region  ============= =============  Pool Events (supplier nalaction) ============= ============= //
  /****************************************************************************************************
   * @notice Supplier (User) interaction
   * @dev Following interactions are expected:
   *
   * ---- tokensReceived()
   *      implementation callback tokensReceived(). Deposit funds via erc777.send() function.
   *
   * ---- RedeemDeposit()
   *
   * ---- _inStreamCallback()
   *      implementation of start stream through supwer app call back
   *
   * ---- inStreamStop()
   *
   * ---- redeemFlow()
   *
   * ---- redeemFlowStop()
   *
   ****************************************************************************************************/

  /**
   * @notice ERC277 call back allowing deposit tokens via .send()
   * @param from Supplier (user sending tokens / depositing)
   * @param amount amount received
   */
  function tokensReceived(
    address operator,
    address from,
    address to,
    uint256 amount,
    bytes calldata userData,
    bytes calldata operatorData
  ) external override {
    require(msg.sender == address(superToken), "INVALID_TOKEN");
    require(amount > 0, "AMOUNT_TO_BE_POSITIVE");


    _poolUpdateCurrentState();

    ///// suppler config updated && pool
    _updateSupplierDeposit(from, amount, 0);

    DataTypes.Supplier memory supplier = _getSupplier(msg.sender);
    bytes  memory payload = abi.encode(amount);
    emit Events.SupplierUpdate(supplier);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.DEPOSIT,payload,block.timestamp,msg.sender);

  }

  function redeemDeposit(uint256 redeemAmount) public {
    uint256 balance = sToken.balanceOf(msg.sender);

    address _supplier = msg.sender;

    require(balance > redeemAmount, "NOT_ENOUGH_BALANCE");
    DataTypes.Supplier memory supplier = _getSupplier(_supplier);
    DataTypes.PoolV2 memory pool;
    //// Update pool state "pool Struct" calculating indexes and timestamp
    _poolUpdateCurrentState();

    ///// suppler config updated && pool
    _updateSupplierDeposit(_supplier, 0, redeemAmount);

    //poolStrategy.withdraw(redeemAmount, _supplier);
   (supplier, pool) =  poolInternal.withdrawDispatcher(supplier,pool, _supplier,  redeemAmount);

 
    if (supplier.outStream.flow > 0) {
      uint256 userBalance = sToken.balanceOf(_supplier);
      if (userBalance < supplier.outStream.minBalance) {
       (supplier, pool) =  poolInternal.cancelFlow(supplier, pool,userBalance, supplier.outStream.minBalance);
      }
    }


    emit Events.SupplierUpdate(supplier);
    bytes  memory payload = abi.encode(redeemAmount);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW,payload,block.timestamp,msg.sender);

       
    poolByTimestamp[pool.timestamp] = pool;
    suppliersByAddress[supplier.supplier] = supplier;

  }

  function redeemFlow(int96 _outFlowRate) external {
    //// update state supplier
    DataTypes.Supplier memory supplier = suppliersByAddress[msg.sender];
    DataTypes.PoolV2 memory pool;
    DataTypes.SupplierEvent flowEvent = supplier.outStream.flow > 0 ? DataTypes.SupplierEvent.OUT_STREAM_UPDATE  : DataTypes.SupplierEvent.OUT_STREAM_START ;

    uint256 realTimeBalance = sToken.balanceOf(msg.sender);

    require(realTimeBalance > 0, "NO_BALANCE");

    _poolUpdateCurrentState();

    bytes memory placeHolder = "0x";

     poolInternal._supplierUpdateCurrentState(supplier.supplier);

    (, supplier , ) = poolInternal._updateSupplierFlow(msg.sender, 0, _outFlowRate, placeHolder);

  


    emit Events.SupplierUpdate(supplier);
    bytes  memory payload = abi.encode(_outFlowRate);
    emit Events.SupplierEvent(flowEvent,payload,block.timestamp,msg.sender);


  }

  function redeemFlowStop() external {
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

    _inStreamCallback(msg.sender, 0, 0, "0x");

    emit Events.SupplierUpdate(supplier);
    bytes  memory payload = abi.encode('');
    emit Events.SupplierEvent(DataTypes.SupplierEvent.OUT_STREAM_STOP,payload,block.timestamp,msg.sender);
  }




  function _inStreamCallback(
    address from,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) internal returns (bytes memory newCtx) {
    newCtx = _ctx;
    _poolUpdateCurrentState();

    poolInternal._supplierUpdateCurrentState(from);

  
    poolInternal._updateSupplierFlow(from, inFlow, 0, _ctx);


    
  }

  // #endregion User Interaction PoolEvents

  // #region  ============= =============  Public Supplier Functions ============= =============

  // #endregion

  // #region  ============= =============  Internal Supplier Functions ============= ============= //

  function _getSupplier(address _supplier) internal returns (DataTypes.Supplier storage) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.createdTimestamp == 0) {
      supplier.createdTimestamp = block.timestamp;
      supplier.supplier = _supplier;
      supplier.timestamp = block.timestamp;
      supplierId++;
      uint256 current = supplierId;
      supplier.id = supplierId;

      supplierAdressById[supplier.id] = _supplier;

    
    }

    supplier.eventId += 1;

    return supplier;
  }

  // function supplierUpdateCurrentState(address _supplier) external {
  //   poolInternal._supplierUpdateCurrentState(_supplier);
  // }

 function internalUpdates(DataTypes.Supplier memory supplier, DataTypes.PoolV2 memory currentPool) external onlyPoolInternal {
      poolByTimestamp[currentPool.timestamp] = currentPool;
      suppliersByAddress[supplier.supplier] = supplier;
  }


  function _updateSupplierDeposit(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit
  ) internal {
 
    DataTypes.Supplier storage supplier = _getSupplier(_supplier);

    poolInternal._supplierUpdateCurrentState(_supplier);

    supplier.deposit = supplier.deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;
 
    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;
     
  }


  // #endregion

  // ============= ============= POOL UPDATE ============= ============= //
  // #region Pool Update

  /**************************************************************************
   * Pool Update
   *
   *************************************************************************/

  function _poolUpdateCurrentState() internal {
    DataTypes.PoolV2 memory lastPool = getLastPool();

    uint256 periodSpan = block.timestamp - lastPool.timestamp;

    if (periodSpan > 0) {
      DataTypes.PoolV2 memory currentPool = poolInternal._poolUpdate(lastPool, periodSpan, poolStrategy.balanceOf());

      poolByTimestamp[block.timestamp] = currentPool;

      lastPoolTimestamp = block.timestamp;

      poolTimestampById[currentPool.id] = block.timestamp;
    }


  }

  // #endregion POOL UPDATE

  // ============= =============  Modifiers ============= ============= //
  // #region Modidiers

  modifier onlyHost() {
    require(msg.sender == address(host), "RedirectAll: support only one host");
    _;
  }

  modifier onlyExpected(ISuperToken _superToken, address agreementClass) {
    require(_isSameToken(_superToken), "RedirectAll: not accepted token");
    require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
    _;
  }

  // endregion

  // ============= =============  Gelato functions ============= ============= //
  // #region Gelato functions

  /// called by Gelato
  // function stopstream(address _receiver, uint8 _flowType) external onlyOps {
  //   //// check if

  //   _poolUpdateCurrentState();
  //   poolInternal._supplierUpdateCurrentState(_receiver);

  //   //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
  //   uint256 fee;
  //   address feeToken;

  //   (fee, feeToken) = IOps(ops).getFeeDetails();

  //   _transfer(fee, feeToken);

  //   ///// OUtFLOW
  //   if (_flowType == 0) {
  //     (, int96 inFlowRate, , ) = cfa.getFlow(superToken, address(this), _receiver);

  //     if (inFlowRate > 0) {
  //       // _cfaLib.deleteFlow(address(this), _receiver, superToken);
  //       _updateSupplierFlow(_receiver, 0, 0, "0x");
  //       console.log("stopStream");
  //     }

  //     bytes32 taskId = suppliersByAddress[_receiver].outStream.cancelFlowId;
  //     if (taskId != bytes32(0)) {
  //       cancelTask(taskId);
  //       suppliersByAddress[_receiver].outStream.cancelFlowId = bytes32(0);
  //     }

  //     console.log("stopOUTStream");
  //   }
  //   ///// INFLOW FLOW
  //   else if (_flowType == 1) {
  //     console.log("stopINStream--1");
  //     (, int96 inFlowRate, , ) = cfa.getFlow(superToken, _receiver, address(this));

  //     if (inFlowRate > 0) {
  //       _cfaLib.deleteFlow(_receiver, address(this), superToken);
  //       _updateSupplierFlow(_receiver, 0, 0, "0x");
  //       console.log("stopINStream");
  //     }

  //     bytes32 taskId = suppliersByAddress[_receiver].inStream.cancelFlowId;
  //     if (taskId != bytes32(0)) {
  //       cancelTask(taskId);
  //       suppliersByAddress[_receiver].inStream.cancelFlowId = bytes32(0);
  //     }
  //   }
  // }


  /// called by Gelato
  function withdrawStep(address _receiver) external onlyOps {
    //// check if

    _poolUpdateCurrentState();
    poolInternal._supplierUpdateCurrentState(_receiver);

    //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
    uint256 fee;
    address feeToken;

    (fee, feeToken) = IOps(ops).getFeeDetails();

    _transfer(fee, feeToken);

    DataTypes.Supplier memory supplier = suppliersByAddress[_receiver];
    DataTypes.PoolV2 memory pool = poolByTimestamp[block.timestamp];
    uint256 userBalance = sToken.balanceOf(_receiver);
    uint256 minBalance = supplier.outStream.minBalance;
    uint256 stepAmount = (uint96(supplier.outStream.flow)) * (supplier.outStream.stepTime);

    ////// user balance goes below min balance, stream will be stopped and all funds will be returned
    if (userBalance < minBalance) {
     
     (supplier, pool) = poolInternal.cancelFlow(supplier,pool, userBalance, minBalance);
    } else {

       (supplier, pool) = poolInternal.withdrawDispatcher(supplier, pool,address(this),  stepAmount);

       pool.deposit = pool.deposit.sub(stepAmount.mul(PRECISSION));
       
      supplier.deposit = supplier.deposit.sub(stepAmount.mul(PRECISSION));
      supplier.outStream.initTime = block.timestamp;

    }
     poolByTimestamp[pool.timestamp] = pool;
    suppliersByAddress[supplier.supplier] = supplier;
    
    emit Events.SupplierUpdate(supplier);
    bytes  memory payload = abi.encode(stepAmount);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW_STEP,payload,block.timestamp,msg.sender);


  }

  function cancelTask(bytes32 _taskId) external onlyPoolInternal {
    IOps(ops).cancelTask(_taskId);
  }

  function withdraw() external returns (bool) {
    (bool result, ) = payable(msg.sender).call{value: address(this).balance}("");
    return result;
  }

  receive() external payable {}

  function transfer(uint256 _amount, address _paymentToken) external onlyPoolStrategy {
    _transfer(_amount, _paymentToken);
  }

  function _transfer(uint256 _amount, address _paymentToken) internal {
    if (_paymentToken == ETH) {
      (bool success, ) = gelato.call{value: _amount}("");
      require(success, "_transfer: ETH transfer failed");
    } else {
      SafeERC20.safeTransfer(IERC20(_paymentToken), gelato, _amount);
    }
  }

  modifier onlyPoolStrategy() {
    require(msg.sender == address(poolStrategy), "Only Strategy");
    _;
  }

  modifier onlySToken() {
    require(msg.sender == address(sToken), "Only Superpool Token");
    _;
  }

  modifier onlyOps() {
    require(msg.sender == address(ops), "OpsReady: onlyOps");
    _;
  }

    modifier onlySuperHost() {
    require(msg.sender == superHost, "Only Host");
    _;
  }

    modifier onlyPoolInternal() {
    require(msg.sender == address(poolInternal), "Only Internla");
    _;
  }

    modifier onlyOwner() {
    require(msg.sender == owner, "Only Owner");
    _;
  }

  // #endregion Gelato functions

  // ============= ============= Super App Calbacks ============= ============= //
  // #region Super App Calbacks
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
    ISuperfluid.Context memory decodedContext = host.decodeCtx(_ctx);

    //// If In-Stream we will request a pool update

    if (receiver == address(this)) {
        DataTypes.Supplier storage supplier =  _getSupplier(sender);
      if (decodedContext.userData.length > 0) {
        uint256 endSeconds = parseLoanData(host.decodeCtx(_ctx).userData);

        supplier.inStream.cancelFlowId = gelatoTasks.createStopStreamTimedTask(sender, endSeconds - MIN_OUTFLOW_ALLOWED, false, 1);
      }

      newCtx = _inStreamCallback(sender, inFlowRate, 0, newCtx);

    emit Events.SupplierUpdate(supplier);
    bytes  memory payload = abi.encode(inFlowRate);
    emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_START,payload,block.timestamp,sender);

      // if (endSeconds > 0) {}
    } else {
 
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
      DataTypes.Supplier storage supplier = _getSupplier(sender);
      newCtx = _inStreamCallback(sender, 0, 0, newCtx);

    emit Events.SupplierUpdate(supplier);
    bytes  memory payload = abi.encode('');
    emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_STOP,payload,block.timestamp,sender);


    } else if (sender == address(this)) {
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

    //// If In-Stream we will request a pool update
    if (receiver == address(this)) {
      DataTypes.Supplier storage supplier = _getSupplier(sender);
      newCtx = _inStreamCallback(sender, inFlowRate, 0, newCtx);
      emit Events.SupplierUpdate(supplier);
    bytes  memory payload = abi.encode('');
    emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_UPDATE,payload,block.timestamp,sender);

    } else {}

    return newCtx;
  }

  // #endregion Super App Calbacks

  /**************************************************************************
   * INTERNAL HELPERS
   *************************************************************************/
  function parseLoanData(bytes memory data) public pure returns (uint256 endSeconds) {
    endSeconds = abi.decode(data, (uint256));
  }

  function _isCFAv1(address agreementClass) private view returns (bool) {
    return ISuperAgreement(agreementClass).agreementType() == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }

  function _isSameToken(ISuperToken _superToken) private view returns (bool) {
    return address(_superToken) == address(superToken);
  }
}
