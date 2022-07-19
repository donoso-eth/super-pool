//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

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
contract PoolFactory is SuperAppBase, IERC777Recipient, Initializable {
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

  mapping(uint256 => DataTypes.Period) public periodByTimestamp;

  mapping(uint256 => uint256) public periodTimestampById;

  address mockYieldSupplier;

  uint256 public lastPeriodTimestamp;

  uint256 public constant PRECISSION = 1_000_000;

  Counters.Counter public periodId;
  Counters.Counter public supplierId;

  address public ops;
  address payable public gelato;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  // #endregion pool state

  constructor() {}

  /**
   * @notice initializer of the Pool
   */
  function initialize(DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer) external initializer {
    ///initialState
    lastPeriodTimestamp = block.timestamp;
    periodByTimestamp[block.timestamp] = DataTypes.Period(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0,0,0);

    periodTimestampById[0] = block.timestamp;

    //// super app && superfluid
    host = poolFactoryInitializer.host;
    superToken = poolFactoryInitializer.superToken;
    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));

    _cfaLib = CFAv1Library.InitData(host, cfa);

    //// gelato
    ops = poolFactoryInitializer.ops;
    gelato = IOps(poolFactoryInitializer.ops).gelato();

    //// tokens receie implementation
    IERC1820Registry _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));

    ///// initializators
  }

  function getPeriod(uint256 _periodId) public view returns (DataTypes.Period memory) {
    return periodByTimestamp[_periodId];
  }

  function mockYield(uint256 _yield) public {
    mockYieldSupplier = msg.sender;
    _updateYield(_yield);
  }

  function getMockYield() internal {
    uint256 periodSpan = block.timestamp - lastPeriodTimestamp;
    uint256 amountToBeTransfered = periodSpan * periodByTimestamp[lastPeriodTimestamp].yieldAccruedSec;
    if (mockYieldSupplier != address(0)) {
      IERC20(superToken).transferFrom(mockYieldSupplier, address(this), amountToBeTransfered);
    }
  }

  // #region  ============= =============  ERC4626 & ERC20 Interface  ============= ============= //
  /****************************************************************************************************
  * @notice ERC4626 & ERC20 interface skeleton
  *
  * ---- deposit()
  *    
  *
  * 
  ****************************************************************************************************/
  function balanceOf(address _supplier) public view returns(uint256 _shares){
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier] ;
    _shares = supplier.shares;
  
    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;
    console.log(145,_shares);
    if (netFlow >= 0) {
       console.log(147,'+',uint96(netFlow));
     _shares= _shares + uint96(netFlow) * (block.timestamp - supplier.timestamp);
    } else {
       console.log(150,'-',uint96(netFlow));
      _shares = _shares  - uint96(-netFlow) * (block.timestamp - supplier.timestamp);
    }



  }
  
  function deposit(address _to, uint256 _value) public returns (uint256 _shares){
    _shares = 10;
  
  }




  // #endregion ERC4626 Interface


  // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //
  /****************************************************************************************************
  * @notice Supplier (User) interaction
  * @dev Following interactions are expected:
  *
  * ---- tokensReceived()
  *      implementation callback tokensReceived(). Deposit funds via erc777.send() function.
  *
  * ---- withdrawDeposit()
  * 
  * ---- inStreamCallback()
  *      implementation of start stream through supwer app call back
  *
  * ---- inStreamStop()
  *
  * ---- withdrawStreamStart()--outStream
  *
  * ---- withdrawStreamStop()
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

    //// retrieve supplier or create a record for the new one
    _getSupplier(from);

    //// Update pool state "period Struct" calculating indexes and timestamp 
    _poolUpdate();


    ///// suppler config updated && period
    _updateSupplierDeposit(from, amount, 0);

    /// Events mnot yet implemented
    //emit Events.SupplyDepositStarted(from, amount);
  }

  function withdrawDeposit(uint256 withdrawAmount) public {
    uint256 realTimeBalance = totalBalanceSupplier(msg.sender);

    require(realTimeBalance >= withdrawAmount, "NOT_ENOUGH_BALANCE");
    
    //// Update pool state "period Struct" calculating indexes and timestamp
    _poolUpdate();

    ///// suppler config updated && period
    _updateSupplierDeposit(msg.sender, 0, withdrawAmount);

    ///// transfer the withdraw amount to the requester
    ISuperToken(superToken).send(msg.sender, withdrawAmount, "0x");
  }

  function inStreamCallback(
    address from,
    int96 inFlow,
    int96 outFlow
  ) internal {
    _poolUpdate();

    _updateSupplierFlow(from, inFlow, 0);

    emit Events.SupplyStreamStarted(from, inFlow);
  }

  ///// NOT IMPLEMENTED
  function inStreamStop() public {
    // DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];
    // require(supplier.inStream.flow > 0, "NO_STREAM");
    // _poolUpdate();
    // _updateSupplierFlow(msg.sender, -supplier.inStream.flow, 0);
    // _updatePeriod(0, 0, -supplier.inStream.flow, 0);
    // host.callAgreement(
    //   cfa,
    //   abi.encodeWithSelector(
    //     cfa.deleteFlow.selector,
    //     superToken,
    //     msg.sender,
    //     address(this),
    //     new bytes(0) // placeholder
    //   ),
    //   "0x"
    // );
  }

  function redeemFlow(int96 outFlowRate) public {
    //// update state supplier
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow == 0, "OUT_STREAM_EXISTS");

    uint256 realTimeBalance = totalBalanceSupplier(msg.sender);

    require(realTimeBalance > 0, "NO_BALANCE");

    _poolUpdate();

    uint256 stopDateInMs = (realTimeBalance).div(uint96(outFlowRate)) + block.timestamp;

    _updateSupplierFlow(msg.sender, 0, outFlowRate);

    ////// start stream
   //+ int96 outAssets = 

    console.log(289,uint96(supplier.outAssets.flow));

   _cfaLib.createFlow(msg.sender, superToken, supplier.outAssets.flow);

    ////// createGelato Task
  }

  /// NOT YED FINALLY IMPLMENTED /// TODO Handle terminated when
  function withdrawStreamStop(uint256 stopDateInMs) public {
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

    if (supplier.outStream.flow != 0) {} else {
      uint256 totalDeposit = supplier.deposit.amount + uint96(supplier.inStream.flow) * (block.timestamp - supplier.timestamp);

      require(totalDeposit > 0, "NO_BALANCE");

      //// TO DO calculate yeild
      uint256 totalYield = 3;

      int96 outFlowRate = int96(int256(totalDeposit + totalYield) / int256(stopDateInMs - block.timestamp));

      //// Advance period

      //// start stream

      host.callAgreement(
        cfa,
        abi.encodeWithSelector(
          cfa.createFlow.selector,
          superToken,
          msg.sender,
          outFlowRate,
          new bytes(0) // placeholder
        ),
        "0x"
      );

      ////// set closing stream task
      bytes32 taskId = IOps(ops).createTimedTask(
        uint128(stopDateInMs),
        180,
        address(this),
        this.stopstream.selector,
        address(this),
        abi.encodeWithSelector(this.checker.selector, msg.sender),
        ETH,
        false
      );

      //// update state supplier
      supplier.outStream.cancelTaskId = taskId;
      supplier.timestamp = block.timestamp;
      supplier.outStream.flow = outFlowRate;
    }
  }

  // #endregion User Interaction PoolEvents

  // ============= =============  Internal Supplier Functions ============= ============= //
  // #region InternalFunctionsInternal Supplier Functions

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

  function _updateSupplierDeposit(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    /// Supplier next values
    uint256 yieldOfPeriod = _calculateYieldSupplier(_supplier);
    supplier.cumulatedYield = supplier.cumulatedYield + yieldOfPeriod;
    supplier.deposit.amount = supplier.deposit.amount + inDeposit - outDeposit;
    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    supplier.shares = supplier.shares + inDeposit - outDeposit;
    periodByTimestamp[block.timestamp].totalShares = periodByTimestamp[block.timestamp].totalShares  + inDeposit - outDeposit;


    //////// if newnetFlow < 0 means  there is already a stream out
    if (netFlow < 0) {
      //// cancel prevoius task
      cancelTask(supplier.outStream.cancelTaskId);

      uint256 stopDateInMs = block.timestamp + supplier.deposit.amount / uint96(netFlow);
      bytes32 taskId = createTimedTask(_supplier, stopDateInMs);
    } else {
      supplier.deposit.amount += uint96(netFlow)*(block.timestamp- supplier.timestamp);
      ///// update period
      supplier.shares = supplier.shares + uint96(netFlow)*(block.timestamp- supplier.timestamp);
      
    
      periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + inDeposit - outDeposit + uint96(netFlow)*(block.timestamp- supplier.timestamp);
      periodByTimestamp[block.timestamp].depositFromInFlowRate -=uint96(netFlow)*(block.timestamp- supplier.timestamp);

     

    }
    supplier.timestamp = block.timestamp;
  }

  function _updateSupplierFlow(
    address _supplier,
    int96 inFlow,
    int96 outFlow
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    /// Supplier next values
    uint256 yieldOfPeriod = _calculateYieldSupplier(_supplier);
    supplier.cumulatedYield = supplier.cumulatedYield + yieldOfPeriod;
    supplier.shares = balanceOf(_supplier);
    int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;
    if (inFlow == 0) {
      supplier.outStream.flow = outFlow;
      supplier.inStream.flow = supplier.inStream.flow;
    } else {
      supplier.inStream.flow = inFlow;
      supplier.outStream.flow = supplier.outStream.flow;
    }

    int96 newNetFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (currentNetFlow < 0) {
      /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE
      cancelTask(supplier.outStream.cancelTaskId);
      supplier.outStream.cancelTaskId = bytes32(0);
      supplier.deposit.amount = supplier.deposit.amount - (block.timestamp - supplier.timestamp) * uint96(-currentNetFlow);
    
      periodByTimestamp[block.timestamp].totalShares =  periodByTimestamp[block.timestamp].totalShares - (block.timestamp - supplier.timestamp) * uint96(-currentNetFlow);
      
      if (newNetFlow >= 0) {

        periodByTimestamp[block.timestamp].outFlowRate += currentNetFlow;
        periodByTimestamp[block.timestamp].inFlowRate += newNetFlow;
        periodByTimestamp[block.timestamp].deposit += supplier.deposit.amount;
        periodByTimestamp[block.timestamp].depositFromOutFlowRate -= supplier.deposit.amount;
      } else {
        periodByTimestamp[block.timestamp].outFlowRate -= currentNetFlow + newNetFlow;
       
        //// creatre timed task
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME
      if (newNetFlow >= 0) {
        /// update values

        periodByTimestamp[block.timestamp].inFlowRate = periodByTimestamp[block.timestamp].inFlowRate + inFlow;
      } else {
        /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

        //// transfer total balance to depositFromOutFlow
        uint256 total = (supplier.cumulatedYield).div(PRECISSION) + supplier.deposit.amount + (block.timestamp - supplier.timestamp) * (uint96(currentNetFlow));
        console.log(465,total);
        uint256 factor = total.div(supplier.shares);
        console.log(467,factor);
        console.log(468,uint96(-newNetFlow));
        int96 outAssets = int96(int256((factor).mul(uint(uint96(-newNetFlow)))));
        console.log(469,uint96(outAssets));

        supplier.outAssets = DataTypes.Stream(outAssets,bytes32(0));
        periodByTimestamp[block.timestamp].outFlowAssetsRate +=supplier.outAssets.flow;

        periodByTimestamp[block.timestamp].outFlowRate += -newNetFlow;
        periodByTimestamp[block.timestamp].inFlowRate -= currentNetFlow;

        periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit - supplier.deposit.amount;
        periodByTimestamp[block.timestamp].depositFromOutFlowRate = total;
        periodByTimestamp[block.timestamp].depositFromInFlowRate -= (block.timestamp - supplier.timestamp) * (uint96(currentNetFlow));

        supplier.cumulatedYield = 0;
        supplier.deposit.amount = total;
        //// creatre timed task
      }
    }

    //////// if newnetFlow < 0 CRETate TIMED TASK
    if (newNetFlow < 0) {
      uint256 stopDateInMs = block.timestamp + supplier.deposit.amount.div(uint96(newNetFlow));
      bytes32 taskId = createTimedTask(_supplier, stopDateInMs);
      supplier.outStream.cancelTaskId = taskId;
    }

    supplier.timestamp = block.timestamp;
  }
  
  /**
   * @notice Calculate the total balance of a user/supplier
   * @dev it calculate the yield earned and add the total deposit (send+stream)
   * @return realtimeBalance the realtime balance multiplied by precission (10**6)
   */
  function totalBalanceSupplier(address _supplier) public view returns (uint256 realtimeBalance) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier);

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      
      realtimeBalance = yieldSupplier + (supplier.deposit.amount + uint96(netFlow) * (block.timestamp - supplier.timestamp))*PRECISSION;
    } else {
      
      realtimeBalance = yieldSupplier + (supplier.deposit.amount - uint96(-netFlow) * (block.timestamp - supplier.timestamp))*PRECISSION;
    }

  }

  function totalYieldEarnedSupplier(address _supplier) public view returns (uint256 yieldSupplier) {
    uint256 yieldTillLastPeriod = _calculateYieldSupplier(_supplier);

 

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex, uint256 yieldOutFlowRateIndex) = _calculateIndexes();

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];


    yieldSupplier =
      supplier.cumulatedYield +
      yieldTillLastPeriod +
      yieldTokenIndex *
      supplier.deposit.amount +
      uint96(supplier.inStream.flow) *
      yieldInFlowRateIndex +
      (yieldOutFlowRateIndex) *
      (uint96(supplier.outStream.flow));



  }

  function _calculateYieldSupplier(address _supplier) internal view returns (uint256 yieldSupplier) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 lastTimestamp = supplier.timestamp;

    ///// Yield from deposit

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      uint256 yieldFromDeposit = supplier.deposit.amount * (periodByTimestamp[lastPeriodTimestamp].yieldTokenIndex - periodByTimestamp[lastTimestamp].yieldTokenIndex);


      ///// Yield from flow
      uint256 yieldFromFlow = uint96(netFlow) * (periodByTimestamp[lastPeriodTimestamp].yieldInFlowRateIndex - periodByTimestamp[lastTimestamp].yieldInFlowRateIndex);
  


      yieldSupplier = yieldFromDeposit + yieldFromFlow;
    } else {
      ///// Yield from outFlow
      uint256 yieldFromOutFlow = uint96(-netFlow) * (periodByTimestamp[lastPeriodTimestamp].yieldOutFlowRateIndex - periodByTimestamp[lastTimestamp].yieldOutFlowRateIndex);
      yieldSupplier = yieldFromOutFlow;
    }
  }

  function getSupplierShares(address _supplier) public view returns (uint256 sharesSupplier){
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];
    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;
   
        if (netFlow >= 0) {
      
      sharesSupplier = supplier.shares  +  uint96(netFlow) * (block.timestamp - supplier.timestamp);
    } else {
      
       sharesSupplier = supplier.shares  - uint96(-netFlow) * (block.timestamp - supplier.timestamp);
    }
  }

  // #endregion

  // ============= ============= POOL UPDATE ============= ============= //
  // #region Pool Update

  /**************************************************************************
   * Pool Update
   *
   *************************************************************************/


  function _poolUpdate() internal {
    periodId.increment();

    getMockYield();

    DataTypes.Period memory currentPeriod = DataTypes.Period(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0,0,0);

    DataTypes.Period memory lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

    (currentPeriod.yieldTokenIndex, currentPeriod.yieldInFlowRateIndex, currentPeriod.yieldOutFlowRateIndex) = _calculateIndexes();

    currentPeriod.yieldTokenIndex = currentPeriod.yieldTokenIndex + lastPeriod.yieldTokenIndex;
    currentPeriod.yieldInFlowRateIndex = currentPeriod.yieldInFlowRateIndex + lastPeriod.yieldInFlowRateIndex;
    currentPeriod.depositFromInFlowRate = uint96(lastPeriod.inFlowRate) * periodSpan + lastPeriod.depositFromInFlowRate;
    currentPeriod.depositFromOutFlowRate = lastPeriod.depositFromOutFlowRate - uint96(lastPeriod.outFlowRate) * periodSpan;
    currentPeriod.deposit = lastPeriod.deposit;

    currentPeriod.totalShares = lastPeriod.totalShares + uint96(lastPeriod.inFlowRate) * periodSpan  - uint96(lastPeriod.outFlowRate) * periodSpan;

    currentPeriod.outFlowAssetsRate = lastPeriod.outFlowAssetsRate;

    currentPeriod.inFlowRate = lastPeriod.inFlowRate;
    currentPeriod.outFlowRate = lastPeriod.outFlowRate;

    currentPeriod.yieldAccruedSec = lastPeriod.yieldAccruedSec;

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
      uint256 periodYieldInFlowRateIndex,
      uint256 periodYieldOutFlowRateIndex
    )
  {
    DataTypes.Period storage lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = block.timestamp - lastPeriod.timestamp;

    uint256 dollarSecondsInFlow = (uint96(lastPeriod.inFlowRate) * (periodSpan**2)) / 2 + lastPeriod.depositFromInFlowRate * periodSpan;

    uint256 dollarSecondsOutFlow = lastPeriod.depositFromOutFlowRate * periodSpan - (uint96(lastPeriod.outFlowRate) * (periodSpan**2)) / 2;

    uint256 dollarSecondsDeposit = lastPeriod.deposit * periodSpan;

    uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow + dollarSecondsOutFlow;

    uint256 yieldPeriod = _calculatePoolYieldPeriod();

    /// we ultiply by PRECISSION for 5 decimals precision

    if (totalAreaPeriod == 0 || yieldPeriod == 0) {
      periodYieldTokenIndex = 0;
      periodYieldInFlowRateIndex = 0;
    } else {
      uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
      uint256 outFlowContribution = (dollarSecondsOutFlow * PRECISSION);
      uint256 depositContribution = (dollarSecondsDeposit * PRECISSION);
      if (lastPeriod.deposit != 0) {
        periodYieldTokenIndex = ((depositContribution * yieldPeriod).div(lastPeriod.deposit * totalAreaPeriod));
      }
      if (lastPeriod.inFlowRate != 0) {
        periodYieldInFlowRateIndex = ((inFlowContribution * yieldPeriod).div(uint96(lastPeriod.inFlowRate) * totalAreaPeriod));
      }
      if (lastPeriod.outFlowRate != 0) {
        periodYieldOutFlowRateIndex = ((outFlowContribution * yieldPeriod).div(uint96(lastPeriod.outFlowRate) * totalAreaPeriod));
      }
    }
  }

  function _calculatePoolYieldPeriod() internal view returns (uint256 yield) {
    yield = (block.timestamp - lastPeriodTimestamp) * periodByTimestamp[lastPeriodTimestamp].yieldAccruedSec;
  }

  /**
   * @notice Add the yield to the Period
   * @dev  When yield are added to the pool, if there is active stream this
   *       function will call _poolUpdate() fucntion
   *       If there is not active stream, the proportion remains the same and the period remains unchanged
   */
  function _updateYield(uint256 yieldAmountPerSec) internal {
    _poolUpdate();

    periodByTimestamp[block.timestamp].yieldAccruedSec = yieldAmountPerSec;

    //   currentPeriod.yield = currentPeriod.yield + yieldAmount;
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

  modifier onlyOps() {
    require(msg.sender == ops, "OpsReady: onlyOps");
    _;
  }

  function createTimedTask(address supplier, uint256 stopDateInMs) internal returns (bytes32 taskId) {
    taskId = IOps(ops).createTimedTask(
      uint128(stopDateInMs),
      180,
      address(this),
      this.stopstream.selector,
      address(this),
      abi.encodeWithSelector(this.checker.selector, supplier),
      ETH,
      false
    );
  }

  function cancelTask(bytes32 _taskId) public {
    IOps(ops).cancelTask(_taskId);
  }

  /// called by Gelato
  function stopstream(address receiver) external onlyOps {
    //// check if
    (, int96 inFlowRate, , ) = cfa.getFlow(superToken, address(this), receiver);

    //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
    uint256 fee;
    address feeToken;

    (fee, feeToken) = IOps(ops).getFeeDetails();

    _transfer(fee, feeToken);

    if (inFlowRate > 0) {
      host.callAgreement(
        cfa,
        abi.encodeWithSelector(
          cfa.deleteFlow.selector,
          superToken,
          address(this),
          receiver,
          new bytes(0) // placeholder
        ),
        "0x"
      );

      //// TO DO transfer last yield won
    }

    bytes32 taskId = suppliersByAddress[receiver].outStream.cancelTaskId;
    if (taskId != bytes32(0)) {
      cancelTask(taskId);
      suppliersByAddress[receiver].outStream.cancelTaskId = bytes32(0);
    }
  }

  // called by Gelato Execs
  function checker(address receiver) external returns (bool canExec, bytes memory execPayload) {
    canExec = true;

    execPayload = abi.encodeWithSelector(this.stopstream.selector, address(receiver));
  }

  function withdraw() external returns (bool) {
    (bool result, ) = payable(msg.sender).call{value: address(this).balance}("");
    return result;
  }

  receive() external payable {}

  function _transfer(uint256 _amount, address _paymentToken) internal {
    if (_paymentToken == ETH) {
      (bool success, ) = gelato.call{value: _amount}("");
      require(success, "_transfer: ETH transfer failed");
    } else {
      SafeERC20.safeTransfer(IERC20(_paymentToken), gelato, _amount);
    }
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

    //// If In-Stream we will request a pool update
    if (receiver == address(this)) {
      inStreamCallback(sender, inFlowRate, 0);
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

    DataTypes.Supplier storage supplier = suppliersByAddress[sender];

    // if (sender == address(this)) {} else if (receiver == address(this) && supplier.inStream.flow > 0) {
    //   //// CHECK If is an Instrean and flow is still positive it means is a hard Stop, no previous yield will be calculated
    //   supplier.deposit.amount += uint96(supplier.inStream.flow) * (block.timestamp - supplier.timestamp);
    //   supplier.inStream.flow = 0;
    // }

    return _ctx;
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

    console.log("FLOW_UPDATED");

    (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

    //// If In-Stream we will request a pool update
    if (receiver == address(this)) {
      inStreamCallback(sender, inFlowRate, 0);
    }

    return newCtx;
  }

  // #endregion Super App Calbacks

  /**************************************************************************
   * INTERNAL HELPERS
   *************************************************************************/

  function _isCFAv1(address agreementClass) private view returns (bool) {
    return ISuperAgreement(agreementClass).agreementType() == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }

  function _isSameToken(ISuperToken _superToken) private view returns (bool) {
    return address(_superToken) == address(superToken);
  }
}
