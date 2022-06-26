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

  uint256[] activeSuppliers;

  mapping(address => DataTypes.Supplier) public suppliersByAddress;

  mapping(uint256 => address) supplierAdressById;

  mapping(uint256 => DataTypes.Period) public periodByTimestamp;
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
  function initialize(
    DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer
  ) external initializer {
    ///initialState
    lastPeriodTimestamp = block.timestamp;
    periodByTimestamp[block.timestamp] = DataTypes.Period(
      block.timestamp,
      0,
      0,
      0,
      0,
      0,
      0
    );
    console.log(block.timestamp);
    //// super app
    host = poolFactoryInitializer.host;
    superToken = poolFactoryInitializer.superToken;
    cfa = IConstantFlowAgreementV1(
      address(
        host.getAgreementClass(
          keccak256(
            "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
          )
        )
      )
    );

    //// gelato
    ops = poolFactoryInitializer.ops;
    gelato = IOps(poolFactoryInitializer.ops).gelato();

    //// tokens receie implementation
    IERC1820Registry _erc1820 = IERC1820Registry(
      0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
    );
    bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256(
      "ERC777TokensRecipient"
    );

    _erc1820.setInterfaceImplementer(
      address(this),
      TOKENS_RECIPIENT_INTERFACE_HASH,
      address(this)
    );

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

  function getPeriod(uint256 _periodId)
    public
    view
    returns (DataTypes.Period memory)
  {
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
    period.flowRate = period.flowRate + inFlow - outFlow;
  }

  function mockYield(uint256 _yield) public {
    _updateYield(_yield);
  }

  function calculateYieldSupplier(address _supplier)
    public
    returns (uint256 yield)
  {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    require(supplier.createdTimestamp > 0, "SUPPLIER_NOT_AVAILABLE");

    uint256 startDepositTimestamp = supplier.deposit.timestamp;

    return yield;
  }

  // ============= =============  Gelato functions ============= ============= //
  // #region Gelato functions

  modifier onlyOps() {
    require(msg.sender == ops, "OpsReady: onlyOps");
    _;
  }

  function createTimedTask(address supplier, uint256 stopDateInMs)
    internal
    returns (bytes32 taskId)
  {
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
  function checker(address receiver)
    external
    returns (bool canExec, bytes memory execPayload)
  {
    canExec = true;

    execPayload = abi.encodeWithSelector(
      this.stopstream.selector,
      address(receiver)
    );
  }

  function withdraw() external returns (bool) {
    (bool result, ) = payable(msg.sender).call{value: address(this).balance}(
      ""
    );
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

  function _getSupplier(address _supplier)
    internal
    returns (DataTypes.Supplier storage)
  {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.createdTimestamp == 0) {
      supplier.createdTimestamp = block.timestamp;
      supplier.supplier = _supplier;

      supplierId.increment();
      supplier.supplierId = supplierId.current();

      supplierAdressById[supplier.supplierId] = _supplier;

      activeSuppliers.push(supplier.supplierId);
    }

    // periodId.increment();
    // supplier.periodId = periodId.current();

    return supplier;
  }

  function _updateSupplier(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit,
    int96 inFlow,
    int96 outFlow
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    /// Supplier next values
    _calculateYieldSupplier(_supplier);

    supplier.deposit.amount += inDeposit - outDeposit;
    int96 newNetFlow = supplier.inStream.flow +
      inFlow -
      supplier.outStream.flow -
      outFlow;

    if (supplier.outStream.cancelTaskId != bytes32(0)) {
      cancelTask(supplier.outStream.cancelTaskId);
    }

    if (newNetFlow < 0) {
      uint256 stopDateInMs = block.timestamp +
        supplier.deposit.amount /
        uint96(newNetFlow);
      bytes32 taskId = createTimedTask(_supplier, stopDateInMs);
    }
  }

  function totalBalanceSupplier(address supplier)
    public
    view
    returns (uint256 realtimeBalance)
  {
    DataTypes.Supplier storage withdrawer = suppliersByAddress[msg.sender];


    uint256 totalDeposit = (block.timestamp - withdrawer.inStream.timestamp) *
      uint96(withdrawer.inStream.flow) - (block.timestamp - withdrawer.outStream.timestamp) *uint96(withdrawer.outStream.flow);

    realtimeBalance = withdrawer.deposit.amount + totalDeposit;
  }

  function _calculateYieldSupplier(address _supplier) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
 
    uint256 periodTo = periodId.current();

    // for (uint256 i = periodFrom; i < periodTo; i++) {
    //   DataTypes.Period memory _period = periodByTimestamp[i];

    //   if (_period.yield > 0) {
    //     int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    //     int256 areaFlow = ((netFlow) * int256(_period.periodSpan**2)) / 2;

    //     int256 areaDeposit = ((
    //       int256(_period.timestamp - supplier.createdTimestamp)
    //     ) *
    //       netFlow +
    //       int256(supplier.depositAmount)) * int256(_period.periodSpan);

    //     int256 totalAreaPeriod = areaDeposit + areaFlow;

    //     console.log(_period.periodTWAP);
    //     console.log(uint256(totalAreaPeriod));
    //     supplier.TWAP += uint256(totalAreaPeriod);
    //   } else {
    //     supplier.TWAP += 0;
    //   }
    // }
    // supplier.cumulatedYield = 5;
  }

  // #endregion

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

    _poolUpdate();

    //// update global period

    periodByTimestamp[block.timestamp].deposit =
      periodByTimestamp[block.timestamp].deposit +
      amount;

    ///// suppler config updated
    _updateSupplier(from, amount, 0, 0, 0);

    emit Events.SupplyDepositStarted(from, amount);
  }

  function inStreamCallback(
    address from,
    int96 inFlow,
    int96 outFlow
  ) internal {
    DataTypes.Supplier storage supplier = _getSupplier(from);

    _poolUpdate();

    int96 currentFlow = supplier.inStream.flow;

    supplier.inStream = DataTypes.Stream(currentFlow + inFlow, bytes32(0),block.timestamp);

    periodByTimestamp[block.timestamp].flowRate =
      periodByTimestamp[block.timestamp].flowRate +
      inFlow;

    emit Events.SupplyStreamStarted(from, inFlow);
    if (inFlow != 0) {}
  }

  function afterUpdatedCallback() internal {}

  function inStreamStop() public {
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];
    require(supplier.inStream.flow > 0, "NO_STREAM");

    _poolUpdate();

    _updateSupplier(msg.sender, 0, 0, -supplier.inStream.flow, 0);

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

  //// withdraw

  function withdrawDeposit(uint256 withdrawAmount) public {
    uint256 realTimeBalance = totalBalanceSupplier(msg.sender);

    require(realTimeBalance >= withdrawAmount, "NOT_ENOUGH_BALANCE");

    _poolUpdate();

    _updateSupplier(msg.sender, 0, withdrawAmount, 0, 0);

    _updatePeriod(0, withdrawAmount, 0, 0);

    ISuperToken(superToken).send(msg.sender, withdrawAmount, "0x");
  }

  function withdrawStreamStart(uint256 stopDateInMs) public {
    //// update state supplier
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow == 0, "OUT_STREAM_EXISTS");

    uint256 totalDeposit = supplier.deposit.amount +
      uint96(supplier.inStream.flow) *
      (block.timestamp - supplier.inStream.timestamp);

    require(totalDeposit > 0, "NO_BALANCE");

    _poolUpdate();

    int96 outFlowRate = int96(
      int256(totalDeposit) / int256(stopDateInMs - block.timestamp)
    );

    _updateSupplier(msg.sender, 0, 0, 0, outFlowRate);

    _updatePeriod(0, 0, 0, outFlowRate);
  }

  /// request by the user trough the contract /// TODO Handle terminated when
  function withdrawStreamStop(uint256 stopDateInMs) public {
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

    if (supplier.outStream.flow != 0) {} else {
      uint256 totalDeposit = supplier.deposit.amount +
        uint96(supplier.inStream.flow) *
        (block.timestamp - supplier.inStream.timestamp);

      require(totalDeposit > 0, "NO_BALANCE");

      //// TO DO calculate yeild
      uint256 totalYield = 3;

      int96 outFlowRate = int96(
        int256(totalDeposit + totalYield) /
          int256(stopDateInMs - block.timestamp)
      );

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
      supplier.outStream.timestamp = block.timestamp;
      supplier.outStream.flow = outFlowRate;
    }
  }

  // #endregion User Interaction PoolEvents

  /**
   * @notice Add the yield to the Period
   * @dev  When yield are added to the pool, if there is active stream this
   *       function will call _poolUpdate() fucntion
   *       If there is not active stream, the proportion remains the same and the period remains unchanged
   */
  function _updateYield(uint256 yieldAmountPerSec) internal {
    _poolUpdate();

    periodByTimestamp[block.timestamp].yieldSec = yieldAmountPerSec;

    //   currentPeriod.yield = currentPeriod.yield + yieldAmount;
  }

  /**
   * @notice Calculates the TWAP, the yieldshare by active user and push a new  Period
   * @dev This function will be called when liquidity is updated deposit/streamed/withdraw
   *      When yield are added to the pool, if there is active stream this lfunction will be calculated too.
   *      If there is not active stream, the proportion remains the same and the period remains unchanged
   */
  function _poolUpdate() internal {
    DataTypes.Period memory currentPeriod = DataTypes.Period(
      block.timestamp,
      0,
      0,
      0,
      0,
      0,
      0
    );

    DataTypes.Period memory lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

    (
      currentPeriod.yieldTokenIndex,
      currentPeriod.yieldFlowRateIndex
    ) = _calculateIndexes();

    currentPeriod.depositFromFlowRate =
      uint96(lastPeriod.flowRate) *
      periodSpan +
      lastPeriod.depositFromFlowRate;
    currentPeriod.deposit = lastPeriod.deposit;
    currentPeriod.flowRate = lastPeriod.flowRate;

    currentPeriod.timestamp = block.timestamp;

    periodByTimestamp[block.timestamp] = currentPeriod;

    lastPeriodTimestamp = block.timestamp;

    console.log("pool_update");
  }

  function _calculateIndexes()
    internal
    view
    returns (uint256 yieldTokenIndex, uint256 yieldFlowRateIndex)
  {
    DataTypes.Period storage lastPeriod = periodByTimestamp[
      lastPeriodTimestamp
    ];



    uint256 periodSpan = block.timestamp - lastPeriod.timestamp;
 

    uint256 dollarSecondsFlow = (uint96(lastPeriod.flowRate) *
      (periodSpan**2)) /
      2 +
      lastPeriod.depositFromFlowRate *
      periodSpan;
    uint256 areaDeposit = lastPeriod.deposit * periodSpan;


    uint256 totalAreaPeriod = areaDeposit;

    if (lastPeriod.flowRate >= 0) {
      totalAreaPeriod = totalAreaPeriod + dollarSecondsFlow;
    } else {
      totalAreaPeriod = totalAreaPeriod - dollarSecondsFlow;
    }

    uint256 yieldPeriod = _calculatePoolYieldPeriod();

    /// we ultiply by 10000 for 5 decimals precision

    if (totalAreaPeriod == 0) {
      yieldTokenIndex = 0;
      yieldFlowRateIndex = 0;
      return (0, 0);
    }

    uint256 flowContribution = (dollarSecondsFlow * 10000).div(totalAreaPeriod);
    uint256 depositContribution = 10000 - flowContribution;

    yieldTokenIndex =
      lastPeriod.yieldTokenIndex +
      ((depositContribution) * yieldPeriod.div(1000));
    yieldFlowRateIndex =
      lastPeriod.yieldFlowRateIndex +
      ((flowContribution) * yieldPeriod.div(1000));
  }

  function _calculatePoolYieldPeriod() internal view returns (uint256 yield) {
    yield =
      (block.timestamp - lastPeriodTimestamp) *
      periodByTimestamp[lastPeriodTimestamp].yieldSec;
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
  )
    external
    override
    onlyExpected(_superToken, _agreementClass)
    onlyHost
    returns (bytes memory newCtx)
  {
    newCtx = _ctx;

    (address sender, address receiver) = abi.decode(
      _agreementData,
      (address, address)
    );

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
    (address sender, address receiver) = abi.decode(
      _agreementData,
      (address, address)
    );

    DataTypes.Supplier storage supplier = suppliersByAddress[sender];

    if (sender == address(this)) {} else if (
      receiver == address(this) && supplier.inStream.flow > 0
    ) {
      //// CHECK If is an Instrean and flow is still positive it means is a hard Stop, no previous yield will be calculated
      supplier.deposit.amount +=
        uint96(supplier.inStream.flow) *
        (block.timestamp - supplier.inStream.timestamp);
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
  )
    external
    override
    onlyExpected(_superToken, _agreementClass)
    onlyHost
    returns (bytes memory newCtx)
  {
    (address sender, address receiver) = abi.decode(
      _agreementData,
      (address, address)
    );

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
    return
      ISuperAgreement(agreementClass).agreementType() ==
      keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }

  function _isSameToken(ISuperToken _superToken) private view returns (bool) {
    return address(_superToken) == address(superToken);
  }
}
