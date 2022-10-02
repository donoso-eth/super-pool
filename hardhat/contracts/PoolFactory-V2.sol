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

import {ISTokenFactoryV2}  from './interfaces/ISTokenFactory-V2.sol';
import {IPoolStrategyV2} from './interfaces/IPoolStrategy-V2.sol';
import {IGelatoResolverV2} from './interfaces/IGelatoResolver-V2.sol'; 

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

  mapping(uint256 => DataTypes.PeriodV2) public periodByTimestamp;

  mapping(uint256 => uint256) public periodTimestampById;



  uint256 public lastPeriodTimestamp;

  uint256 public constant PRECISSION = 1_000_000;

  Counters.Counter public periodId;
  Counters.Counter public supplierId;

  address public ops;
  address payable public gelato;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint256 MAX_INT;

  uint256 public poolBuffer; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits

  uint256 public MIN_OUTFLOW_ALLOWED = 3600; // 1 hour minimum flow == Buffer
  uint8 public PARTIAL_DEPOSIT; // proportinal decrease deposit

  ISTokenFactoryV2 sToken;
  IPoolStrategyV2 poolStrategy;
  IGelatoResolverV2 gelatoResolver;


  uint256 public DEPOSIT_TRIGGER_AMOUNT = 0;
  uint256 public DEPOSIT_TRIGGER_TIME = 3600;

  IERC20 token;

  // #endregion pool state

  //// ERC4626 EVents
  constructor() {}

  /**
   * @notice initializer of the Pool
   */
  function initialize(DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer) external initializer {
    ///initialState


    lastPeriodTimestamp = block.timestamp;
    periodByTimestamp[block.timestamp] = DataTypes.PeriodV2(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    periodTimestampById[0] = block.timestamp;

    //// super app && superfluid
    host = poolFactoryInitializer.host;
    superToken = poolFactoryInitializer.superToken;
    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
    token = poolFactoryInitializer.token;
    sToken = poolFactoryInitializer.sToken;
    poolStrategy = poolFactoryInitializer.poolStrategy;
    gelatoResolver = poolFactoryInitializer.gelatoResolver;
    token.approve(address(poolStrategy), MAX_INT);

    _cfaLib = CFAv1Library.InitData(host, cfa);

    //// gelato
    ops = poolFactoryInitializer.ops;
    gelato = IOps(poolFactoryInitializer.ops).gelato();

    //// tokens receie implementation
    IERC1820Registry _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));

    MAX_INT = 2**256 - 1;

    ///// initializators
  }

  function getPeriod(uint256 _periodId) external view returns (DataTypes.PeriodV2 memory) {
    return periodByTimestamp[_periodId];
  }

  function getLastPeriod() external view returns (DataTypes.PeriodV2 memory) {
    return periodByTimestamp[lastPeriodTimestamp];
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
    uint256 outDeposit,
    uint256 outAssets
  ) external onlySToken {
     
     DataTypes.Supplier memory supplierTo = _getSupplier(_supplier);

     supplierTo.deposit.amount = supplierTo.deposit.amount + (outAssets * PRECISSION) - (inDeposit * PRECISSION);
 
    periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + (outAssets * PRECISSION) - (inDeposit * PRECISSION);
    _updateSupplierDeposit(_supplier, inDeposit, outDeposit, outAssets);
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

    console.log("tokens_reveived");

    _deposit(from, from, amount);
  }

  function _deposit(
    address from,
    address receiver,
    uint256 assets
  ) internal {
    //// retrieve supplier or create a record for the new one
    // _getSupplier(from);

    //// Update pool state "period Struct" calculating indexes and timestamp
    _poolUpdateCurrentState();

    ///// suppler config updated && period
    _updateSupplierDeposit(from, assets, 0, 0);

    /// Events mnot yet implemented
    //emit Deposit(from, receiver, assets, assets);
  }

  function redeemDeposit(uint256 redeemAmount) external {
    uint256 shares = sToken.balanceOfShares(msg.sender);

    address supplier = msg.sender;

    require(shares > redeemAmount, "NOT_ENOUGH_BALANCE");

    if (shares == redeemAmount) {
      _redeemAll(msg.sender, false);
    } else {
      //// Update pool state "period Struct" calculating indexes and timestamp
      _poolUpdateCurrentState();

      uint256 outAssets = 0;
      uint256 myShares = sToken.balanceOfShares(supplier);
      uint256 total = sToken.getSupplierBalance(supplier);
      uint256 factor = total.div(myShares);
      outAssets = factor.mul(redeemAmount).div(PRECISSION);

      poolStrategy.withdraw(outAssets);
      ISuperToken(superToken).send(supplier, outAssets, "0x");

      ///// suppler config updated && period
      _updateSupplierDeposit(supplier, 0, redeemAmount, outAssets);
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
      cancelTask(supplier.outAssets.cancelTaskId);
      supplier.outAssets.cancelTaskId = gelatoResolver.createStopStreamTimedTask(msg.sender, _endSeconds - MIN_OUTFLOW_ALLOWED, false, 0);
    }
  }

  function redeemFlowStop() external {
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

    _inStreamCallback(msg.sender, 0, 0, "0x");

    //// Advance period
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


  function totalYieldEarnedSupplier(address _supplier) public view  returns (uint256 yieldSupplier) {
    uint256 yieldTillLastPeriod = _calculateYieldSupplier(_supplier);

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex) = _calculateIndexes();

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.amount.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream.flow) * yieldInFlowRateIndex;
   
    yieldSupplier = yieldTillLastPeriod + yieldDeposit + yieldInFlow;
  }

  // #endregion

  // #region  ============= =============  Internal Supplier Functions ============= ============= //


  function _getSupplier(address _supplier) internal returns (DataTypes.Supplier storage) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.createdTimestamp == 0) {
      supplier.createdTimestamp = block.timestamp;
      supplier.supplier = _supplier;
      supplier.timestamp = block.timestamp;
      supplierId.increment();

      supplier.supplierId = supplierId.current();

      supplierAdressById[supplier.supplierId] = _supplier;

      activeSuppliers.push(supplier.supplierId);
    }

    supplier.eventId += 1;

    return supplier;
  }


  function supplierUpdateCurrentState(address _supplier) external {
    _supplierUpdateCurrentState( _supplier);
  }

  function _supplierUpdateCurrentState(address _supplier) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.timestamp < block.timestamp) {
      uint256 supplierBalance = sToken.getSupplierBalance(_supplier);
      uint256 supplierShares = sToken.balanceOfShares(_supplier);

      supplier.shares = supplierShares;

      int256 supplierDepositUpdate = int256(supplierBalance) - int256(supplier.deposit.amount);

      uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier);

      int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

      if (netFlow >= 0) {
        periodByTimestamp[block.timestamp].depositFromInFlowRate =
          periodByTimestamp[block.timestamp].depositFromInFlowRate -
          uint96(netFlow) *
          (block.timestamp - supplier.timestamp) *
          PRECISSION;
        periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + uint256(supplierDepositUpdate);
      }
      supplier.deposit.amount = supplierBalance;
      supplier.timestamp = block.timestamp;
    }
  }



  function _updateSupplierDeposit(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit,
    uint256 outAssets
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    _supplierUpdateCurrentState(_supplier);

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;
    //////// if newnetFlow < 0 means  there is already a stream out

    supplier.shares = supplier.shares + inDeposit - outDeposit;

    supplier.deposit.amount = supplier.deposit.amount + inDeposit * PRECISSION - outAssets * PRECISSION;

    periodByTimestamp[block.timestamp].totalShares = periodByTimestamp[block.timestamp].totalShares + inDeposit - outDeposit;
    periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outAssets * PRECISSION;

    if (netFlow < 0) {
      uint256 total = supplier.deposit.amount; //_getSupplierBalance(_supplier);
      uint256 factor = total.div(supplier.shares);
      int96 updatedOutAssets = int96(int256(factor.mul(uint96(supplier.outStream.flow)).div(PRECISSION)));
      periodByTimestamp[block.timestamp].outFlowAssetsRate = periodByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow + updatedOutAssets;
      periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit - supplier.deposit.amount;
      _outStreamHasChanged(_supplier, -netFlow, updatedOutAssets);
    }
  }

  function _updateSupplierFlow(
    address _supplier,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) internal returns (bytes memory newCtx) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    newCtx = _ctx;

    _supplierUpdateCurrentState(_supplier);

    int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;
    int96 newNetFlow = inFlow - outFlow;

    if (currentNetFlow < 0) {
      /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE

      if (newNetFlow >= 0) {
        periodByTimestamp[block.timestamp].outFlowRate = periodByTimestamp[block.timestamp].outFlowRate + currentNetFlow;

        periodByTimestamp[block.timestamp].inFlowRate = periodByTimestamp[block.timestamp].inFlowRate + newNetFlow;

        periodByTimestamp[block.timestamp].outFlowAssetsRate = periodByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow;

        ///// refactor logic
        if (newNetFlow == 0) {
          _cfaLib.deleteFlow(address(this), _supplier, superToken);
        } else {
          newCtx = _cfaLib.deleteFlowWithCtx(_ctx, address(this), _supplier, superToken);
        }

        cancelTask(supplier.outAssets.cancelTaskId);
        supplier.outAssets.cancelTaskId = bytes32(0);
        supplier.outAssets.flow = 0;
      } else {
        uint256 factor = supplier.deposit.amount.div(supplier.shares);
        int96 outAssets = int96(int256((factor).mul(uint256(uint96(-newNetFlow))).div(PRECISSION)));
        periodByTimestamp[block.timestamp].outFlowRate = periodByTimestamp[block.timestamp].outFlowRate + currentNetFlow - newNetFlow;
        periodByTimestamp[block.timestamp].outFlowAssetsRate = periodByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow + outAssets;
        
        periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit - supplier.deposit.amount;

        //  supplier.outAssets = DataTypes.Stream(outAssets, bytes32(0));
        //// creatre timed task
        _outStreamHasChanged(_supplier, -newNetFlow, outAssets);
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

      if (newNetFlow >= 0) {
        periodByTimestamp[block.timestamp].inFlowRate = periodByTimestamp[block.timestamp].inFlowRate - currentNetFlow + inFlow;
      } else {
        /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

        uint256 factor = supplier.deposit.amount.div(supplier.shares);

        int96 outAssets = int96(int256((factor).mul(uint256(uint96(-newNetFlow))).div(PRECISSION)));

        periodByTimestamp[block.timestamp].outFlowAssetsRate = periodByTimestamp[block.timestamp].outFlowAssetsRate + outAssets;

        periodByTimestamp[block.timestamp].outFlowRate += -newNetFlow;
        periodByTimestamp[block.timestamp].inFlowRate -= currentNetFlow;

        periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit - supplier.deposit.amount;
        
        _outStreamHasChanged(_supplier, -newNetFlow, outAssets);
      }
    }

    supplier.inStream.flow = inFlow;
    supplier.outStream.flow = outFlow;

    console.log("updateSupplierFlow");
  }

  function _calculateYieldSupplier(address _supplier) internal view returns (uint256 yieldSupplier) {
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

    uint256 lastTimestamp = supplier.timestamp;

    ///// Yield from deposit

    uint256 yieldFromDeposit = (supplier.deposit.amount * (periodByTimestamp[lastPeriodTimestamp].yieldTokenIndex - periodByTimestamp[lastTimestamp].yieldTokenIndex)).div(
      PRECISSION
    );

    yieldSupplier = yieldFromDeposit;
    if (supplier.inStream.flow > 0) {
      ///// Yield from flow
      uint256 yieldFromFlow = uint96(supplier.inStream.flow) *
        (periodByTimestamp[lastPeriodTimestamp].yieldInFlowRateIndex - periodByTimestamp[lastTimestamp].yieldInFlowRateIndex);

      yieldSupplier = yieldSupplier + yieldFromFlow;
    }
  }

  function _outStreamHasChanged(
    address _supplier,
    int96 newOutFlow,
    int96 newOutAssets
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 endMs = supplier.shares.div(uint96(newOutFlow));
    if (endMs < MIN_OUTFLOW_ALLOWED) {
      revert("No sufficent funds");
    }
    supplier.outAssets.flow = newOutAssets;

    if (supplier.inStream.flow > 0) {
      _cfaLib.deleteFlow(_supplier, address(this), superToken);
    }

    if (supplier.outStream.flow > 0) {
      cancelTask(supplier.outAssets.cancelTaskId);

      _cfaLib.updateFlow(_supplier, superToken, newOutAssets);
    } else {
      _cfaLib.createFlow(_supplier, superToken, newOutAssets);
    }
    supplier.outAssets.cancelTaskId = gelatoResolver.createStopStreamTimedTask(_supplier, endMs - MIN_OUTFLOW_ALLOWED, true, 0);

    supplier.outAssets.stepAmount = supplier.deposit.amount.div(PARTIAL_DEPOSIT);

    supplier.outAssets.stepTime = 50;

    supplier.outAssets.cancelWithdrawId = gelatoResolver.createWithdraStepTask(_supplier, supplier.outAssets.stepTime);

    ///
  }

  function _redeemAll(address _supplier, bool closeInStream) internal {
    //// Update pool state "period Struct" calculating indexes and timestamp
    _poolUpdateCurrentState();

    _supplierUpdateCurrentState(_supplier);

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    periodByTimestamp[block.timestamp].totalShares = periodByTimestamp[block.timestamp].totalShares - supplier.shares;
    periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit - supplier.deposit.amount;

    uint256 withdrawalAmount = supplier.deposit.amount.div(PRECISSION);

    poolStrategy.withdraw(withdrawalAmount);
    ISuperToken(superToken).send(_supplier, withdrawalAmount, "0x");
    supplier.shares = 0;
    supplier.deposit.amount = 0;

    if (supplier.outStream.flow > 0) {
      periodByTimestamp[block.timestamp].outFlowRate = periodByTimestamp[block.timestamp].outFlowRate - supplier.outStream.flow;
      periodByTimestamp[block.timestamp].outFlowAssetsRate = periodByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow;
      _cfaLib.deleteFlow(address(this), _supplier, superToken);
      supplier.outAssets = DataTypes.OutAssets(0, bytes32(0), 0, 0, bytes32(0));
      supplier.outStream = DataTypes.Stream(0, bytes32(0));
    } else if (supplier.inStream.flow > 0 && closeInStream == true) {
      periodByTimestamp[block.timestamp].inFlowRate = periodByTimestamp[block.timestamp].inFlowRate - supplier.inStream.flow;
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

  function _poolUpdateCurrentState() public {
    periodId.increment();

    DataTypes.PeriodV2 memory currentPeriod = DataTypes.PeriodV2(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    DataTypes.PeriodV2 memory lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

    currentPeriod.depositFromInFlowRate = uint96(lastPeriod.inFlowRate) * PRECISSION * periodSpan + lastPeriod.depositFromInFlowRate;
    
    currentPeriod.deposit = lastPeriod.deposit;
    (currentPeriod.yieldTokenIndex, currentPeriod.yieldInFlowRateIndex) = _calculateIndexes();

    currentPeriod.yieldTokenIndex = currentPeriod.yieldTokenIndex + lastPeriod.yieldTokenIndex;
    currentPeriod.yieldInFlowRateIndex = currentPeriod.yieldInFlowRateIndex + lastPeriod.yieldInFlowRateIndex;
    
    currentPeriod.totalShares = lastPeriod.totalShares + uint96(lastPeriod.inFlowRate) * periodSpan - uint96(lastPeriod.outFlowRate) * periodSpan;

    currentPeriod.outFlowAssetsRate = lastPeriod.outFlowAssetsRate;

    currentPeriod.inFlowRate = lastPeriod.inFlowRate;
    currentPeriod.outFlowRate = lastPeriod.outFlowRate;

    currentPeriod.timestamp = block.timestamp;

    periodByTimestamp[block.timestamp] = currentPeriod;

    lastPeriodTimestamp = block.timestamp;

    periodTimestampById[periodId.current()] = block.timestamp;

    console.log("pool_update");
  }

  function _calculateIndexes()
    internal
    view
    returns (
      uint256 periodYieldTokenIndex,
      uint256 periodYieldInFlowRateIndex
    )
  {
    DataTypes.PeriodV2 storage lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = block.timestamp - lastPeriod.timestamp;

    uint256 dollarSecondsInFlow = ((uint96(lastPeriod.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPeriod.depositFromInFlowRate * periodSpan;
    uint256 dollarSecondsDeposit = lastPeriod.deposit * periodSpan;

    uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow;

    uint256 yieldPeriod = _calculatePoolYieldPeriod();

    /// we ultiply by PRECISSION for 5 decimals precision

    if (totalAreaPeriod == 0 || yieldPeriod == 0) {
      periodYieldTokenIndex = 0;
      periodYieldInFlowRateIndex = 0;
    } else {
      uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
      uint256 depositContribution = (dollarSecondsDeposit * PRECISSION * PRECISSION);
      if (lastPeriod.deposit != 0) {
        periodYieldTokenIndex = ((depositContribution * yieldPeriod).div((lastPeriod.deposit) * totalAreaPeriod));
      }
      if (lastPeriod.inFlowRate != 0) {
        periodYieldInFlowRateIndex = ((inFlowContribution * yieldPeriod).div(uint96(lastPeriod.inFlowRate) * totalAreaPeriod));
      }

    }
  }

  function _calculatePoolYieldPeriod() internal view returns (uint256 yield) {
    // yield = (block.timestamp - lastPeriodTimestamp) * periodByTimestamp[lastPeriodTimestamp].yieldAccruedSec;

    yield = 3; //IAllocationMock(MOCK_ALLOCATION).calculateStatus();
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

      bytes32 taskId = suppliersByAddress[_receiver].outAssets.cancelTaskId;
      if (taskId != bytes32(0)) {
        cancelTask(taskId);
        suppliersByAddress[_receiver].outAssets.cancelTaskId = bytes32(0);
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
    uint256 withdrawalAmount = supplier.outAssets.stepAmount;

    if (supplier.deposit.amount < supplier.outAssets.stepAmount) {
      withdrawalAmount = supplier.deposit.amount;
      cancelTask(supplier.outAssets.cancelWithdrawId);
    }
    poolStrategy.withdraw(withdrawalAmount);
  }

  modifier onlyOps() {
    require(msg.sender == ops, "OpsReady: onlyOps");
    _;
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

  modifier onlyPoolStrategy () {
    require(msg.sender == address(poolStrategy), "Only Strategy");
    _;
  }

    modifier onlySToken () {
    require(msg.sender == address(sToken), "Only Superpool Token");
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

        supplier.inStream.cancelTaskId = gelatoResolver.createStopStreamTimedTask(sender, endSeconds - MIN_OUTFLOW_ALLOWED, false, 1);
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
