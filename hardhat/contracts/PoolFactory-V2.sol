//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
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

  uint256 PRECISSION;

  // 1 hour minimum flow == Buffer
  uint8 public STEPS; // proportinal decrease deposit
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public SUPERFLUID_DEPOSIT;
  uint56 public MIN_OUTFLOW_ALLOWED;

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
    poolByTimestamp[block.timestamp] = DataTypes.PoolV2(0, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

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

    STEPS = resolverSettings.getSteps();
    SUPERFLUID_DEPOSIT = resolverSettings.getSuperfluidDeposit();
    POOL_BUFFER = resolverSettings.getPoolBuffer();
    MIN_OUTFLOW_ALLOWED = 3600;

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

  function poolUpdateUser(address user) external {
    _poolUpdateCurrentState();
    _supplierUpdateCurrentState(user);
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
  //   DataTypes.Supplier memory supplierTo = _getSupplier(_supplier);

  //   supplierTo.deposit = supplierTo.deposit + (outDeposit * PRECISSION) - (inDeposit * PRECISSION);

  //   poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + (outDeposit * PRECISSION) - (inDeposit * PRECISSION);
    _updateSupplierDeposit(_supplier, inDeposit, outDeposit);
  }

  function pushedToStrategy(uint256 amount) external onlyPoolStrategy {

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

  function redeemDeposit(uint256 redeemAmount) public {
    uint256 balance = sToken.balanceOf(msg.sender);

    address _supplier = msg.sender;

    require(balance > redeemAmount, "NOT_ENOUGH_BALANCE");
    DataTypes.Supplier memory supplier = _getSupplier(_supplier);

    //// Update pool state "pool Struct" calculating indexes and timestamp
    _poolUpdateCurrentState();

    ///// suppler config updated && pool
    _updateSupplierDeposit(_supplier, 0, redeemAmount);

    //poolStrategy.withdraw(redeemAmount, _supplier);
    _withdrawDispatcher(_supplier, _supplier,  redeemAmount);

    // poolByTimestamp[block.timestamp].yieldSnapshot = poolByTimestamp[block.timestamp].yieldSnapshot - redeemAmount;

    if (supplier.outStream.flow > 0) {
      uint256 userBalance = sToken.balanceOf(_supplier);
      if (userBalance < supplier.outStream.minBalance) {
        _cancelFlow(_supplier, userBalance, supplier.outStream.minBalance);
      }
    }

    emit Events.SupplierUpdate(supplier);
    console.log("event");
  }

  function redeemFlow(int96 _outFlowRate, uint256 _endSeconds) external {
    //// update state supplier
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    //require(supplier.outStream.flow == 0, "OUT_STREAM_EXISTS");

    bool currentOutFlow = supplier.outStream.flow > 0 ? true : false;

    uint256 realTimeBalance = sToken.balanceOf(msg.sender);

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

  function closeAccount() external {}

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
    DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

    if (supplier.timestamp < block.timestamp) {
      uint256 supplierBalance = sToken.getSupplierBalance(_supplier);

      uint256 yieldSupplier = poolInternal.totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

      if (supplier.inStream.flow > 0) {
        uint256 inflow = uint96(supplier.inStream.flow) * (block.timestamp - supplier.timestamp);

        pool.depositFromInFlowRate = pool.depositFromInFlowRate - inflow * PRECISSION;
        pool.deposit = inflow * PRECISSION + pool.deposit;
        supplier.deposit = supplier.deposit + inflow * PRECISSION;
      }

      if (supplier.outStream.flow > 0) {
        // pool.deposit = yieldSupplier + pool.deposit;
        // supplier.deposit = supplier.deposit + yieldSupplier;
      }

      pool.deposit = yieldSupplier + pool.deposit;
      supplier.deposit = supplier.deposit + yieldSupplier;
      supplier.timestamp = block.timestamp;
    }
  }

  function _updateSupplierDeposit(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit
  ) internal {
    console.log(385);
    DataTypes.Supplier storage supplier = _getSupplier(_supplier);
    console.log(387);
    _supplierUpdateCurrentState(_supplier);
    console.log(389);
    supplier.deposit = supplier.deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;
    console.log(391);
    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;
        console.log(393);
  }

  function _updateSupplierFlow(
    address _supplier,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) internal returns (bytes memory newCtx) {
    DataTypes.Supplier storage supplier = _getSupplier(_supplier);
    DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];
    newCtx = _ctx;

    _supplierUpdateCurrentState(_supplier);

    int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;
    int96 newNetFlow = inFlow - outFlow;

    if (currentNetFlow < 0) {
      /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE

      if (newNetFlow >= 0) {
        pool.outFlowRate = pool.outFlowRate + currentNetFlow;

        pool.inFlowRate = pool.inFlowRate + newNetFlow;

        ///// refactor logic
        if (newNetFlow == 0) {
          _cfaLib.deleteFlow(address(this), _supplier, superToken);
        } else {
          newCtx = _cfaLib.deleteFlowWithCtx(_ctx, address(this), _supplier, superToken);
        }

        gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);
        uint256 alreadyStreamed = uint96(supplier.outStream.flow)*(block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION)- alreadyStreamed.mul(PRECISSION);
        pool.outFlowBuffer = pool.outFlowBuffer - supplier.outStream.minBalance;
        supplier.outStream = DataTypes.OutStream(0, bytes32(0), 0, 0, 0, 0, bytes32(0));


      } else {
        pool.outFlowRate = pool.outFlowRate + currentNetFlow - newNetFlow;

     //   pool.deposit = pool.deposit - supplier.deposit;

        //// creatre timed task
        _outStreamHasChanged(_supplier, -newNetFlow);
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

      if (newNetFlow >= 0) {
        pool.inFlowRate = pool.inFlowRate - currentNetFlow + inFlow;
      } else {
        /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

        pool.outFlowRate += -newNetFlow;
        pool.inFlowRate -= currentNetFlow;

        pool.deposit = pool.deposit;
        if (currentNetFlow > 0) {
          _cfaLib.deleteFlow(_supplier, address(this), superToken);
        }
        if (supplier.inStream.cancelTaskId != bytes32(0)) {
          cancelTask(supplier.inStream.cancelTaskId);
        }
   
        _outStreamHasChanged(_supplier, -newNetFlow);
      }
    }

    supplier.inStream.flow = inFlow;
    supplier.outStream.flow = outFlow;

    console.log("updateSupplierFlow");
  }

  function _createOutStream(
    address _supplier,
    uint256 newMinBalance,
    int96 newOutFlow,
    uint256 prevoiusMinBalance,
    uint256 stepAmount,
    uint256 stepTime
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

   

    if (newMinBalance > prevoiusMinBalance) {

          _withdrawDispatcher(_supplier, address(this), newMinBalance-prevoiusMinBalance);
    }

  

 
    pool.outFlowBuffer = pool.outFlowBuffer + newMinBalance;
    pool.deposit = pool.deposit - newMinBalance.mul(PRECISSION);

    supplier.deposit = supplier.deposit - newMinBalance.mul(PRECISSION);

    supplier.outStream.minBalance = newMinBalance;


    supplier.outStream.stepAmount = stepAmount;

    supplier.outStream.stepTime = stepTime;
    supplier.outStream.initTime = block.timestamp;

    supplier.outStream.cancelWithdrawId = gelatoTasks.createWithdraStepTask(_supplier, supplier.outStream.stepTime);

  }

  function _outStreamHasChanged(address _supplier, int96 newOutFlow) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

    uint256 userBalance = sToken.balanceOf(_supplier);
    uint256 stepTime = userBalance.div(uint256(STEPS)).div(uint96(newOutFlow));
    uint256 stepAmount = (uint96(newOutFlow)) * (stepTime);
    uint256 minBalance = stepAmount.add((POOL_BUFFER.add(SUPERFLUID_DEPOSIT)).mul(uint96(newOutFlow)));

    if (supplier.outStream.flow == 0) {
      if (userBalance < minBalance) {
        revert("No sufficent funds");
      }

      // poolStrategy.withdraw(minBalance, address(this));
      _createOutStream(_supplier, minBalance, newOutFlow, 0, stepAmount, stepTime);

      _cfaLib.createFlow(_supplier, superToken, newOutFlow);
 
    } else if (supplier.outStream.flow > 0) {
      if (supplier.outStream.cancelTaskId != bytes32(0)) {
        cancelTask(supplier.outStream.cancelTaskId);
      }

      if (userBalance < minBalance) {
        _cancelFlow(_supplier, userBalance, minBalance);
      } else if (supplier.outStream.flow != newOutFlow) {
        gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);

        uint256 alreadyStreamed = uint96(supplier.outStream.flow)*(block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION)- alreadyStreamed.mul(PRECISSION);
        pool.outFlowBuffer = pool.outFlowBuffer - supplier.outStream.minBalance;
        _createOutStream(_supplier, minBalance, newOutFlow, supplier.outStream.minBalance, stepAmount, stepTime);
        _cfaLib.updateFlow(_supplier, superToken, newOutFlow);
      }
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

  function _poolUpdateCurrentState() internal {
    DataTypes.PoolV2 memory lastPool = getLastPool();

    uint256 periodSpan = block.timestamp - lastPool.timestamp;

    if (periodSpan > 0) {
      DataTypes.PoolV2 memory currentPool = poolInternal._poolUpdate(lastPool, periodSpan, poolStrategy.balanceOf());

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
  // function stopstream(address _receiver, uint8 _flowType) external onlyOps {
  //   //// check if

  //   _poolUpdateCurrentState();
  //   _supplierUpdateCurrentState(_receiver);

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

  //     bytes32 taskId = suppliersByAddress[_receiver].outStream.cancelTaskId;
  //     if (taskId != bytes32(0)) {
  //       cancelTask(taskId);
  //       suppliersByAddress[_receiver].outStream.cancelTaskId = bytes32(0);
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

  //     bytes32 taskId = suppliersByAddress[_receiver].inStream.cancelTaskId;
  //     if (taskId != bytes32(0)) {
  //       cancelTask(taskId);
  //       suppliersByAddress[_receiver].inStream.cancelTaskId = bytes32(0);
  //     }
  //   }
  // }

  function _withdrawDispatcher(
    address _supplier,
    address _receiver,
    uint256 withdrawAmount
  ) internal {

  
    DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

 

    uint256 poolAvailable = 0;
    if (superToken.balanceOf(address(this)) > (pool.outFlowBuffer)){
        poolAvailable = superToken.balanceOf(address(this)) - (pool.outFlowBuffer);
    } 

    console.log(633, poolAvailable);

    if (poolAvailable >= withdrawAmount) {
      console.log("NOT PUSHED");
      if (_supplier == _receiver) {
        IERC20(address(superToken)).transfer(_receiver, withdrawAmount);
      }
    } else {
      console.log("YES PUSHED");
      uint256 balance = poolStrategy.balanceOf();
      uint256 fromStrategy = withdrawAmount - poolAvailable;
      uint256 correction;
      if (fromStrategy > balance) {
            correction = fromStrategy-balance;
            poolStrategy.withdraw(balance, _receiver);
             pool.yieldSnapshot = pool.yieldSnapshot - balance;
          if (_supplier == _receiver) {
              IERC20(address(superToken)).transfer(_receiver, correction);
            }

      } else {
          poolStrategy.withdraw(fromStrategy, _receiver);
            pool.yieldSnapshot = pool.yieldSnapshot - fromStrategy;
          // if (_supplier == _receiver) {
          //   IERC20(address(superToken)).transfer(_receiver, poolAvailable);
          // }
      }

    
        
    }
     console.log(668,pool.yieldSnapshot);
  }

  function _cancelFlow(
    address _receiver,
    uint256 userBalance,
    uint256 minBalance
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_receiver];
    DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

    gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);

    pool.outFlowBuffer = pool.outFlowBuffer - minBalance;
    _withdrawDispatcher(_receiver, _receiver,  userBalance);
    pool.deposit = pool.deposit - userBalance;
    pool.outFlowRate = pool.outFlowRate - supplier.outStream.flow;
    supplier.deposit = 0;
    supplier.outStream = DataTypes.OutStream(0, bytes32(0), 0, 0, 0, 0, bytes32(0));
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
    DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];
    uint256 userBalance = sToken.balanceOf(_receiver);
    uint256 minBalance = supplier.outStream.minBalance;
    uint256 stepAmount = (uint96(supplier.outStream.flow)) * (supplier.outStream.stepTime);

    ////// user balance goes below min balance, stream will be stopped and all funds will be returned
    if (userBalance < minBalance) {
      console.log("XXXXXXXXXXXXX 696 XXXXXXXXXXXX");
      _cancelFlow(_receiver, userBalance, minBalance);
    } else {

      _withdrawDispatcher(_receiver, address(this),  stepAmount);

       pool.deposit = pool.deposit.sub(stepAmount.mul(PRECISSION));
       
      supplier.deposit = supplier.deposit.sub(stepAmount.mul(PRECISSION));
      supplier.outStream.initTime = block.timestamp;
    }
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
