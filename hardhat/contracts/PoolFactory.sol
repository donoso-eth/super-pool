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

contract PoolFactory is SuperAppBase, IERC777Recipient, Initializable {
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
  uint256 public lastPeriodTimestamp;

  Counters.Counter public periodId;
  Counters.Counter public supplierId;

  address public ops;
  address payable public gelato;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor() {}

  /**
   * @notice initializer of the contract/oracle
   */
  function initialize(DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer) external initializer {
    ///initialState
    lastPeriodTimestamp = block.timestamp;
    periodByTimestamp[block.timestamp] = DataTypes.Period(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0);

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

  function getPeriod(uint256 _periodId) public view returns (DataTypes.Period memory) {
    return periodByTimestamp[_periodId];
  }

  function _updatePeriod(
    uint256 inDeposit,
    uint256 outDeposit,
    int96 inFlow,
    int96 outFlow
  ) internal {
    DataTypes.Period storage period = periodByTimestamp[lastPeriodTimestamp];
    period.deposit = period.deposit + inDeposit - outDeposit;
    period.inFlowRate = period.inFlowRate + inFlow - outFlow;
  }

  function mockYield(uint256 _yield) public {
    _updateYield(_yield);
  }

  // ============= =============  User Interaction PoolEvents ============= ============= //
  // #region User Interaction PoolEvents

  //// deposit (erc777 tokensReceive callback or afterCreatedstream  and afterTerminatedCallback  superapp callback)

  function tokensReceived(
    address operator,
    address from,
    address to,
    uint256 amount,
    bytes calldata userData,
    bytes calldata operatorData
  ) external override {
    // do stuff
    require(msg.sender == address(superToken), "INVALID_TOKEN");
    require(amount > 0, "AMOUNT_TO_BE_POSITIVE");

    console.log("tokens_reveived");
    _getSupplier(from);

    _poolUpdate();

    //// update global period

    ///// suppler config updated && period

    _updateSupplierDeposit(from, amount, 0);

    emit Events.SupplyDepositStarted(from, amount);
  }

  //// withdraw

  function withdrawDeposit(uint256 withdrawAmount) public {
    uint256 realTimeBalance = totalBalanceSupplier(msg.sender);

    require(realTimeBalance >= withdrawAmount, "NOT_ENOUGH_BALANCE");

    _poolUpdate();

    _updateSupplierDeposit(msg.sender, 0, withdrawAmount);

    ISuperToken(superToken).send(msg.sender, withdrawAmount, "0x");
  }

  function inStreamCallback(
    address from,
    int96 inFlow,
    int96 outFlow
  ) internal {
    DataTypes.Supplier storage supplier = _getSupplier(from);

    _poolUpdate();

    int96 currentFlow = supplier.inStream.flow;

    _updateSupplierFlow(from, inFlow, 0);

    emit Events.SupplyStreamStarted(from, inFlow);
  }

  function afterUpdatedCallback() internal {}

  function inStreamStop() public {
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];
    require(supplier.inStream.flow > 0, "NO_STREAM");

    _poolUpdate();

    _updateSupplierFlow(msg.sender, -supplier.inStream.flow, 0);

    _updatePeriod(0, 0, -supplier.inStream.flow, 0);

    host.callAgreement(
      cfa,
      abi.encodeWithSelector(
        cfa.deleteFlow.selector,
        superToken,
        msg.sender,
        address(this),
        new bytes(0) // placeholder
      ),
      "0x"
    );
  }

  function withdrawStreamStart(uint256 stopDateInMs) public {
    //// update state supplier
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow == 0, "OUT_STREAM_EXISTS");

    uint256 realTimeBalance = totalBalanceSupplier(msg.sender);

    require(realTimeBalance > 0, "NO_BALANCE");

    _poolUpdate();

    int96 outFlowRate = int96(int256(realTimeBalance) / int256(stopDateInMs - block.timestamp));

    _updateSupplierFlow(msg.sender, 0, outFlowRate);


    ////// start stream

    _cfaLib.createFlow(msg.sender, superToken, outFlowRate);

    ////// createGelato Task
  }

  /// request by the user trough the contract /// TODO Handle terminated when
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

  // ============= =============  Internal Supplier Functions ============= ============= //
  // #region InternalFunctions

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

    // periodId.increment();
    // supplier.periodId = periodId.current();

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

    supplier.deposit.amount += inDeposit - outDeposit;
    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    supplier.timestamp = block.timestamp;

    //////// if newnetFlow < 0 means  there is already a stream out
    if (netFlow < 0) {
      //// cancel prevoius task
      cancelTask(supplier.outStream.cancelTaskId);

      uint256 stopDateInMs = block.timestamp + supplier.deposit.amount / uint96(netFlow);
      bytes32 taskId = createTimedTask(_supplier, stopDateInMs);
    } else {
      ///// update period
      periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + inDeposit - outDeposit;
    }
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

    int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;

    supplier.inStream.flow = supplier.inStream.flow + inFlow;
    supplier.outStream.flow = supplier.outStream.flow - outFlow;

    int96 newNetFlow = supplier.inStream.flow - supplier.outStream.flow;

    supplier.timestamp = block.timestamp;

    if (currentNetFlow < 0) {
      /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE
      cancelTask(supplier.outStream.cancelTaskId);
      supplier.outStream.cancelTaskId = bytes32(0);
      if (newNetFlow >= 0) {
        /// update values
        /// balance assoication from deposit from to stream
        supplier.deposit.amount = supplier.deposit.amount - (block.timestamp - supplier.timestamp) * uint96(currentNetFlow);
        periodByTimestamp[block.timestamp].outFlowRate -= currentNetFlow;
        periodByTimestamp[block.timestamp].inFlowRate += newNetFlow;
        periodByTimestamp[block.timestamp].deposit = supplier.deposit.amount;
        periodByTimestamp[block.timestamp].depositFromOutFlowRate = 0;
      } else {
        supplier.deposit.amount = supplier.deposit.amount - (block.timestamp - supplier.timestamp) * uint96(currentNetFlow);
        periodByTimestamp[block.timestamp].outFlowRate -= currentNetFlow + newNetFlow;
        //// creatre timed task
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME
      if (newNetFlow >= 0) {
        /// update values

        supplier.inStream.flow = supplier.inStream.flow + inFlow;
        periodByTimestamp[block.timestamp].inFlowRate = periodByTimestamp[block.timestamp].inFlowRate + inFlow;
      } else {
        /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

        //// transfer total balance to depositFromOutFlow
        uint256 total = supplier.cumulatedYield + supplier.deposit.amount + (block.timestamp - supplier.timestamp) * (uint96(currentNetFlow));
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
  }

  function totalBalanceSupplier(address _supplier) public view returns (uint256 realtimeBalance) {
    uint256 yieldTillLastPeriod = _calculateYieldSupplier(_supplier);
   
    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex, uint256 yieldOutFlowRateIndex) = _calculateIndexes();

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    realtimeBalance =   supplier.cumulatedYield + 
      yieldTokenIndex *
      supplier.deposit.amount +
      uint96(supplier.inStream.flow) *
      yieldInFlowRateIndex +
      (yieldOutFlowRateIndex).div(uint96(supplier.outStream.flow));
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
      uint256 yieldFromOutFlow = uint96(netFlow) * (periodByTimestamp[lastPeriodTimestamp].yieldOutFlowRateIndex - periodByTimestamp[lastTimestamp].yieldOutFlowRateIndex);
      yieldSupplier = yieldFromOutFlow;
    }
  }

  // #endregion

  /**
   * @notice Calculates the TWAP, the yieldshare by active user and push a new  Period
   * @dev This function will be called when liquidity is updated deposit/streamed/withdraw
   *      When yield are added to the pool, if there is active stream this lfunction will be calculated too.
   *      If there is not active stream, the proportion remains the same and the period remains unchanged
   */
  function _poolUpdate() internal {
    periodId.increment();

    DataTypes.Period memory currentPeriod = DataTypes.Period(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    DataTypes.Period memory lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

    (currentPeriod.yieldTokenIndex, currentPeriod.yieldInFlowRateIndex, currentPeriod.yieldOutFlowRateIndex) = _calculateIndexes();

    currentPeriod.yieldTokenIndex = currentPeriod.yieldTokenIndex + lastPeriod.yieldTokenIndex;
    currentPeriod.yieldInFlowRateIndex = currentPeriod.yieldInFlowRateIndex + lastPeriod.yieldInFlowRateIndex;

    currentPeriod.depositFromInFlowRate = uint96(lastPeriod.inFlowRate) * periodSpan + lastPeriod.depositFromInFlowRate;
    currentPeriod.deposit = lastPeriod.deposit;
    currentPeriod.inFlowRate = lastPeriod.inFlowRate;

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

    uint256 areaDeposit = lastPeriod.deposit * periodSpan;

    uint256 totalAreaPeriod = areaDeposit + dollarSecondsInFlow + dollarSecondsOutFlow;

    uint256 yieldPeriod = _calculatePoolYieldPeriod();

    /// we ultiply by 10000 for 5 decimals precision

    if (totalAreaPeriod == 0 || yieldPeriod == 0) {
      periodYieldTokenIndex = 0;
      periodYieldInFlowRateIndex = 0;
    } else {
      uint256 inFlowContribution = (dollarSecondsInFlow * 10000).div(totalAreaPeriod);
      uint256 outFlowContribution = (dollarSecondsOutFlow * 10000).div(totalAreaPeriod);
      uint256 depositContribution = 10000 - inFlowContribution - outFlowContribution;

      periodYieldTokenIndex = (depositContribution * yieldPeriod).div(10000);
      periodYieldInFlowRateIndex = (inFlowContribution * yieldPeriod).div(10000);
      periodYieldOutFlowRateIndex = (outFlowContribution * yieldPeriod).div(10000);
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

    if (sender == address(this)) {} else if (receiver == address(this) && supplier.inStream.flow > 0) {
      //// CHECK If is an Instrean and flow is still positive it means is a hard Stop, no previous yield will be calculated
      supplier.deposit.amount += uint96(supplier.inStream.flow) * (block.timestamp - supplier.timestamp);
      supplier.inStream.flow = 0;
    }

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
    (address sender, address receiver) = abi.decode(_agreementData, (address, address));

    // if (sender == address(this)) {} else {
    //   (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

    //   DataTypes.Supplier storage supplier = suppliersByAddress[sender];

    //   uint256 supplierId = supplier.supplierId;

    //   uint256 _periodId = periodId.current();

    //   //// current stream
    //   int96 currentStream = supplier.inStream.flow;

    //   periodByTimestamp[_periodId].flow = --supplier.inStream.flow;

    //   supplier.inStream = DataTypes.Stream(0, bytes32(0));
    // }
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
