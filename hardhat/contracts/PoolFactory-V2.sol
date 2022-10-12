//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {ISTokenFactoryV2} from "./interfaces/ISTokenFactory-V2.sol";
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
contract PoolFactoryV2 is Initializable, SuperAppBase, IERC777Recipient {
  // #region pool state

  using SafeMath for uint256;
  using Counters for Counters.Counter;

  ISuperfluid public host; // host
  IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address
  ISuperToken superToken;

  using CFAv1Library for CFAv1Library.InitData;
  CFAv1Library.InitData internal _cfaLib;

  uint256[] activeSuppliers;

  mapping(address => DataTypes.Supplier) public suppliersByAddress;

  mapping(uint256 => address) supplierAdressById;

  mapping(uint256 => DataTypes.PoolV2) public poolByTimestamp;

  mapping(uint256 => uint256) public poolTimestampById;

  uint256 public lastPoolTimestamp;

 
  Counters.Counter public supplierId;

  IOps public ops;
  address payable public gelato;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint256 MAX_INT;

  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits

  uint256 PRECISSION;

  uint256 public MIN_OUTFLOW_ALLOWED = 3600; // 1 hour minimum flow == Buffer
  uint8 public PARTIAL_DEPOSIT; // proportinal decrease deposit
  uint256 public DEPOSIT_TRIGGER_AMOUNT = 0;
  uint256 public DEPOSIT_TRIGGER_TIME = 3600;

  ISTokenFactoryV2 sToken;
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
  function initialize(DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer) external initializer {
    ///initialState

    lastPoolTimestamp = block.timestamp;
    poolByTimestamp[block.timestamp] = DataTypes.PoolV2(0, block.timestamp, 0, 0, 0, 0, 0,  0, 0, 0, 0, DataTypes.APY(0, 0));

    poolTimestampById[0] = block.timestamp;

    //// super app && superfluid
    host = poolFactoryInitializer.host;
    superToken = poolFactoryInitializer.superToken;
    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
    token = poolFactoryInitializer.token;

    resolverSettings = IResolverSettingsV2(poolFactoryInitializer.resolverSettings);
    sToken = ISTokenFactoryV2(resolverSettings.getSToken());
    poolStrategy = IPoolStrategyV2(resolverSettings.getPoolStrategy());
    gelatoTasks = IGelatoTasksV2(resolverSettings.getGelatoTasks());
    poolInternal = IPoolInternalV2(resolverSettings.getPoolInternal());

    //// gelato
    ops = IOps(resolverSettings.getGelatoOps());
    gelato = ops.gelato();

    MAX_INT = 2**256 - 1;

    token.approve(address(poolStrategy), MAX_INT);
    superToken.approve(address(poolStrategy), MAX_INT);

    _cfaLib = CFAv1Library.InitData(host, cfa);

    //// tokens receie implementation
    IERC1820Registry _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));

    PRECISSION = resolverSettings.getPrecission();

    ///// initializators
  }

  function getPool(uint256 _timestamp) external view returns (DataTypes.PoolV2 memory) {
    return poolByTimestamp[_timestamp];
  }

  function getLastPool() public view returns (DataTypes.PoolV2 memory) {
    return poolByTimestamp[lastPoolTimestamp];
  }

  function poolUpdate() external {
    _poolUpdateCurrentState();
  }

  function getSupplierByAdress(address _supplier) external view returns (DataTypes.Supplier memory supplier) {
    return suppliersByAddress[_supplier];
  }

  function updateSupplierDeposit(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit
  ) external onlySToken {
    DataTypes.Supplier memory supplierTo = _getSupplier(_supplier);

    supplierTo.deposit = supplierTo.deposit + (outDeposit* PRECISSION) - (inDeposit * PRECISSION);

    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + (outDeposit * PRECISSION) - (inDeposit * PRECISSION);
    _updateSupplierDeposit(_supplier, inDeposit, outDeposit);
  }

  function pushedToStrategy(uint256 amount) external onlyPoolStrategy {
    _poolUpdateCurrentState();
    console.log(183,  poolByTimestamp[lastPoolTimestamp].yieldSnapshot);
    poolByTimestamp[lastPoolTimestamp].yieldSnapshot += amount;
  }

  // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //
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

    console.log("tokens_reveived : ", amount);

    _poolUpdateCurrentState();

    ///// suppler config updated && pool
    _updateSupplierDeposit(from, amount, 0);
  }

  function redeemDeposit(uint256 redeemAmount) external {
    uint256 balance = sToken.balanceOf(msg.sender);

    address _supplier = msg.sender;

    require(balance > redeemAmount, "NOT_ENOUGH_BALANCE");
     DataTypes.Supplier memory supplier = _getSupplier(_supplier);

    if (balance == redeemAmount) {
      _redeemAll(msg.sender, false);
    } else {
      //// Update pool state "pool Struct" calculating indexes and timestamp
      _poolUpdateCurrentState();

      // uint256 outAssets = 0;
      // uint256 myShares = sToken.balanceOfShares(supplier);
      // uint256 total = sToken.getSupplierBalance(supplier);
      // uint256 factor = total.div(myShares);
      // outAssets = factor.mul(redeemAmount).div(PRECISSION);

    
      //ISuperToken(superToken).send(supplier, outAssets, "0x");

      ///// suppler config updated && pool
      _updateSupplierDeposit(_supplier, 0, redeemAmount);

      poolStrategy.withdraw(redeemAmount, _supplier);

      if (supplier.outStream.flow < 0) {
      _outStreamHasChanged(_supplier, supplier.outStream.flow) ;
    }

    emit Events.SupplierUpdate(supplier);
    console.log("event");
    }
  }

  function redeemFlow(int96 _outFlowRate, uint256 _endSeconds) external {
    //// update state supplier
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    //require(supplier.outStream.flow == 0, "OUT_STREAM_EXISTS");

    bool currentOutFlow = supplier.outStream.flow > 0 ? true : false;

    uint256 realTimeBalance = sToken.getSupplierBalance(msg.sender);

    require(realTimeBalance > 0, "NO_BALANCE");

    _poolUpdateCurrentState();

    bytes memory placeHolder = "0x";

    _updateSupplierFlow(msg.sender, 0, _outFlowRate, placeHolder);

    if (_endSeconds > 0) {
      cancelTask(supplier.outStream.cancelTaskId);
      supplier.outStream.cancelTaskId = gelatoTasks.createStopStreamTimedTask(msg.sender, _endSeconds - MIN_OUTFLOW_ALLOWED, false, 0);
    }
  }

  function redeemFlowStop() external {
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

    _inStreamCallback(msg.sender, 0, 0, "0x");

    //// Advance pool
  }

  function closeAccount() external {
    _redeemAll(msg.sender, true);
  }

  function _inStreamCallback(
    address from,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) internal returns (bytes memory newCtx) {
    newCtx = _ctx;
    _poolUpdateCurrentState();
    newCtx = _updateSupplierFlow(from, inFlow, 0, _ctx);
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
      supplierId.increment();
      uint256 current = supplierId.current();
      supplier.id = supplierId.current();

      supplierAdressById[supplier.id] = _supplier;

      activeSuppliers.push(supplier.id);
    }

    supplier.eventId += 1;

    return supplier;
  }

  function supplierUpdateCurrentState(address _supplier) external {
    _supplierUpdateCurrentState(_supplier);
  }

  function _supplierUpdateCurrentState(address _supplier) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.timestamp < block.timestamp) {
      uint256 supplierBalance = sToken.getSupplierBalance(_supplier);
 
      int256 supplierDepositUpdate = int256(supplierBalance) - int256(supplier.deposit);

      uint256 yieldSupplier = poolInternal.totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

      int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

      if (netFlow >= 0) {
        poolByTimestamp[block.timestamp].depositFromInFlowRate =
          poolByTimestamp[block.timestamp].depositFromInFlowRate -
          uint96(netFlow) *
          (block.timestamp - supplier.timestamp) *
          PRECISSION;
        poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + uint256(supplierDepositUpdate);
      }
      supplier.deposit = supplierBalance;
      supplier.timestamp = block.timestamp;
    }
  }

  function _updateSupplierDeposit(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit
  ) internal {
    DataTypes.Supplier storage supplier = _getSupplier(_supplier);

    _supplierUpdateCurrentState(_supplier);

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;
    //////// if newnetFlow < 0 means  there is already a stream out


    supplier.deposit = supplier.deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;

    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;



  }

  function _updateSupplierFlow(
    address _supplier,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) internal returns (bytes memory newCtx) {
    DataTypes.Supplier storage supplier = _getSupplier(_supplier);

    newCtx = _ctx;

    _supplierUpdateCurrentState(_supplier);

    int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;
    int96 newNetFlow = inFlow - outFlow;

    if (currentNetFlow < 0) {
      /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE

      if (newNetFlow >= 0) {
        poolByTimestamp[block.timestamp].outFlowRate = poolByTimestamp[block.timestamp].outFlowRate + currentNetFlow;

        poolByTimestamp[block.timestamp].inFlowRate = poolByTimestamp[block.timestamp].inFlowRate + newNetFlow;

      
        ///// refactor logic
        if (newNetFlow == 0) {
          _cfaLib.deleteFlow(address(this), _supplier, superToken);
        } else {
          newCtx = _cfaLib.deleteFlowWithCtx(_ctx, address(this), _supplier, superToken);
        }

        cancelTask(supplier.outStream.cancelTaskId);
        supplier.outStream.cancelTaskId = bytes32(0);
        supplier.outStream.flow = 0;
      } else {
        poolByTimestamp[block.timestamp].outFlowRate = poolByTimestamp[block.timestamp].outFlowRate + currentNetFlow - newNetFlow;
        
        poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit - supplier.deposit;

    
        //// creatre timed task
        _outStreamHasChanged(_supplier, -newNetFlow);
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

      if (newNetFlow >= 0) {
        poolByTimestamp[block.timestamp].inFlowRate = poolByTimestamp[block.timestamp].inFlowRate - currentNetFlow + inFlow;
      } else {
        /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

     
     
        poolByTimestamp[block.timestamp].outFlowRate += -newNetFlow;
        poolByTimestamp[block.timestamp].inFlowRate -= currentNetFlow;

        poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit - supplier.deposit;

        _outStreamHasChanged(_supplier, -newNetFlow);
      }
    }

    supplier.inStream.flow = inFlow;
    supplier.outStream.flow = outFlow;

    console.log("updateSupplierFlow");
  }


  function _outStreamHasChanged(
    address _supplier,
    int96 newOutFlow
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 endMs = sToken.balanceOf(_supplier).div(uint96(newOutFlow));
    if (endMs < MIN_OUTFLOW_ALLOWED) {
      revert("No sufficent funds");
    }
    supplier.outStream.flow = newOutFlow;

    if (supplier.inStream.flow > 0) {
      _cfaLib.deleteFlow(_supplier, address(this), superToken);
    }

    if (supplier.outStream.flow > 0) {
      cancelTask(supplier.outStream.cancelTaskId);

      _cfaLib.updateFlow(_supplier, superToken, newOutFlow);
    } else {
      _cfaLib.createFlow(_supplier, superToken,newOutFlow);
    }
    supplier.outStream.cancelTaskId = gelatoTasks.createStopStreamTimedTask(_supplier, endMs - MIN_OUTFLOW_ALLOWED, true, 0);

    supplier.outStream.stepAmount = supplier.deposit.div(PARTIAL_DEPOSIT);

    supplier.outStream.stepTime = 50;

    supplier.outStream.cancelWithdrawId = gelatoTasks.createWithdraStepTask(_supplier, supplier.outStream.stepTime);

    ///
  }

  function _redeemAll(address _supplier, bool closeInStream) internal {
    //// Update pool state "pool Struct" calculating indexes and timestamp
    _poolUpdateCurrentState();

    _supplierUpdateCurrentState(_supplier);

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

      poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit - supplier.deposit;

    uint256 withdrawalAmount = supplier.deposit.div(PRECISSION);

    poolStrategy.withdraw(withdrawalAmount, _supplier);
    ISuperToken(superToken).send(_supplier, withdrawalAmount, "0x");

    supplier.deposit = 0;

    if (supplier.outStream.flow > 0) {
      poolByTimestamp[block.timestamp].outFlowRate = poolByTimestamp[block.timestamp].outFlowRate - supplier.outStream.flow;
         _cfaLib.deleteFlow(address(this), _supplier, superToken);
      supplier.outStream= DataTypes.OutStream(0, bytes32(0), 0, 0, bytes32(0));

    } else if (supplier.inStream.flow > 0 && closeInStream == true) {
      poolByTimestamp[block.timestamp].inFlowRate = poolByTimestamp[block.timestamp].inFlowRate - supplier.inStream.flow;
      _cfaLib.deleteFlow(_supplier, address(this), superToken);
      supplier.inStream = DataTypes.Stream(0, bytes32(0));
    }
  }

  // #endregion

  // ============= ============= POOL UPDATE ============= ============= //
  // #region Pool Update

  /**************************************************************************
   * Pool Update
   *
   *************************************************************************/
  function poolUpdateCurrentState() external {}

  function _poolUpdateCurrentState() internal{
     
     DataTypes.PoolV2 memory lastPool = getLastPool();

    uint256 periodSpan = block.timestamp - lastPool.timestamp;

    if (periodSpan > 0) {

      DataTypes.PoolV2 memory currentPool =  poolInternal._poolUpdate(lastPool, periodSpan, poolStrategy.balanceOf());

      poolByTimestamp[block.timestamp] = currentPool;

      lastPoolTimestamp = block.timestamp;

      poolTimestampById[currentPool.id] = block.timestamp;
    }

    console.log("pool_update");
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
  function stopstream(
    address _receiver,
    bool _all,
    uint8 _flowType
  ) external onlyOps {
    //// check if

    _poolUpdateCurrentState();
    _supplierUpdateCurrentState(_receiver);

    //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
    uint256 fee;
    address feeToken;

    (fee, feeToken) = IOps(ops).getFeeDetails();

    _transfer(fee, feeToken);

    ///// OUtFLOW
    if (_flowType == 0) {
      (, int96 inFlowRate, , ) = cfa.getFlow(superToken, address(this), _receiver);

      if (inFlowRate > 0) {
        // _cfaLib.deleteFlow(address(this), _receiver, superToken);
        _updateSupplierFlow(_receiver, 0, 0, "0x");
        console.log("stopStream");
      }

      bytes32 taskId = suppliersByAddress[_receiver].outStream.cancelTaskId;
      if (taskId != bytes32(0)) {
        cancelTask(taskId);
        suppliersByAddress[_receiver].outStream.cancelTaskId = bytes32(0);
      }

      _redeemAll(_receiver, _all);

      console.log("stopOUTStream");
    }
    ///// INFLOW FLOW
    else if (_flowType == 1) {
      console.log("stopINStream--1");
      (, int96 inFlowRate, , ) = cfa.getFlow(superToken, _receiver, address(this));

      if (inFlowRate > 0) {
        _cfaLib.deleteFlow(_receiver, address(this), superToken);
        _updateSupplierFlow(_receiver, 0, 0, "0x");
        console.log("stopINStream");
      }

      bytes32 taskId = suppliersByAddress[_receiver].inStream.cancelTaskId;
      if (taskId != bytes32(0)) {
        cancelTask(taskId);
        suppliersByAddress[_receiver].inStream.cancelTaskId = bytes32(0);
      }
    }
  }

  /// called by Gelato
  function withdrawStep(address _receiver) external onlyOps {
    //// check if

    _poolUpdateCurrentState();
    _supplierUpdateCurrentState(_receiver);

    //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
    uint256 fee;
    address feeToken;

    (fee, feeToken) = IOps(ops).getFeeDetails();

    _transfer(fee, feeToken);

    DataTypes.Supplier storage supplier = suppliersByAddress[_receiver];
    uint256 withdrawalAmount = supplier.outStream.stepAmount;

    if (supplier.deposit < supplier.outStream.stepAmount) {
      withdrawalAmount = supplier.deposit;
      cancelTask(supplier.outStream.cancelWithdrawId);
    }
    poolStrategy.withdraw(withdrawalAmount, address(this));
  }

  function cancelTask(bytes32 _taskId) public {
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
      if (decodedContext.userData.length > 0) {
        DataTypes.Supplier storage supplier = suppliersByAddress[sender];
        uint256 endSeconds = parseLoanData(host.decodeCtx(_ctx).userData);

        supplier.inStream.cancelTaskId = gelatoTasks.createStopStreamTimedTask(sender, endSeconds - MIN_OUTFLOW_ALLOWED, false, 1);
      }

      newCtx = _inStreamCallback(sender, inFlowRate, 0, newCtx);

      // if (endSeconds > 0) {}
    } else {
      console.log("REDEEM FLOW");
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
      newCtx = _inStreamCallback(sender, 0, 0, newCtx);
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
      newCtx = _inStreamCallback(sender, inFlowRate, 0, newCtx);
    } else {}
    console.log("FLOW_UPDATED_FINISH");
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
