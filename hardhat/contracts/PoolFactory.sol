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

  mapping(uint256 => DataTypes.Period) public periodById;

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
    return periodById[_periodId];
  }

  function _updatePeriod(
    uint256 inDeposit,
    uint256 outDeposit,
    int96 inFlow,
    int96 outFlow
  ) internal {
    uint256 id = periodId.current();
    DataTypes.Period storage period = periodById[id];
    period.deposit = period.deposit + inDeposit - outDeposit;
    period.flow = period.flow + inFlow - outFlow;
  }

  function mockYield(uint256 _yield) public {
    _addYield(_yield);
  }

  function calculateYieldSupplier(address _supplier) public returns (uint256) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    require(supplier.createdTimestamp > 0, "SUPPLIER_NOT_AVAILABLE");
    uint256 periodFrom = supplier.periodId;
    uint256 periodTo = periodId.current();

    for (uint256 i = periodFrom; i < periodTo; i++) {
      DataTypes.Period memory _period = periodById[i];

      if (_period.yield > 0) {
        int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

        int256 areaFlow = ((netFlow) * int256(_period.periodSpan**2)) / 2;

        int256 areaDeposit = ((
          int256(_period.timestamp - supplier.createdTimestamp)
        ) *
          netFlow +
          int256(supplier.depositAmount)) * int256(_period.periodSpan);

        int256 totalAreaPeriod = areaDeposit + areaFlow;

        console.log(_period.periodTWAP);
        console.log(uint256(totalAreaPeriod));
        return uint256(totalAreaPeriod);
      } else {
        return 0;
      }
    }
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

    supplier.periodId = periodId.current();

    supplier.depositAmount += inDeposit - outDeposit;
    int96 newNetFlow = supplier.inStream.flow +
      inFlow -
      supplier.outStream.flow -
      outFlow;

    if (supplier.outStream.cancelTaskId != bytes32(0)) {
      cancelTask(supplier.outStream.cancelTaskId);
    }

    if (newNetFlow < 0) {
      uint256 stopDateInMs = block.timestamp +
        supplier.depositAmount /
        uint96(newNetFlow);
      bytes32 taskId = createTimedTask(_supplier, stopDateInMs);
    }
  }

  function _calculateYieldSupplier(address _supplier) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    uint256 periodFrom = supplier.periodId;
    uint256 periodTo = periodId.current();

    for (uint256 i = periodFrom; i < periodTo; i++) {
      DataTypes.Period memory _period = periodById[i];

      if (_period.yield > 0) {
        int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

        int256 areaFlow = ((netFlow) * int256(_period.periodSpan**2)) / 2;

        int256 areaDeposit = ((
          int256(_period.timestamp - supplier.createdTimestamp)
        ) *
          netFlow +
          int256(supplier.depositAmount)) * int256(_period.periodSpan);

        int256 totalAreaPeriod = areaDeposit + areaFlow;

        console.log(_period.periodTWAP);
        console.log(uint256(totalAreaPeriod));
        supplier.TWAP += uint256(totalAreaPeriod);
      } else {
        supplier.TWAP += 0;
      }
    }
    supplier.cumulatedYield = 5;
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

    DataTypes.Supplier storage supplier = _getSupplier(from);

    _poolUpdate();

    //// update global period
    uint256 _periodId = periodId.current();

    periodById[_periodId].deposit = periodById[_periodId].deposit + amount;

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

    if (inFlow != 0) {
      int96 currentFlow = supplier.inStream.flow;

      supplier.inStream = DataTypes.Stream(currentFlow + inFlow, bytes32(0));
      uint256 _periodId = periodId.current();

      periodById[_periodId].flow = periodById[_periodId].flow + inFlow;

      emit Events.SupplyStreamStarted(from, inFlow);
    }
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
    DataTypes.Supplier storage withdrawer = suppliersByAddress[msg.sender];

    int96 netFlow = withdrawer.inStream.flow - withdrawer.outStream.flow;

    int256 totalDeposit = ((
      int256(block.timestamp - withdrawer.lastTimestamp)
    ) * netFlow);

    int256 realtimeBalance = int256(withdrawer.depositAmount) + totalDeposit;

    require(realtimeBalance >= int256(withdrawAmount), "NOT_ENOUGH_BALANCE");

    _poolUpdate();

    _updateSupplier(msg.sender, 0, withdrawAmount, 0, 0);

    _updatePeriod(0, withdrawAmount, 0, 0);

    ISuperToken(superToken).send(msg.sender, withdrawAmount, "0x");
  }

  function withdrawStreamStart(uint256 stopDateInMs) public {
    //// update state supplier
    DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

    require(supplier.outStream.flow == 0, "OUT_STREAM_EXISTS");

    uint256 totalDeposit = supplier.depositAmount +
      uint96(supplier.inStream.flow) *
      (block.timestamp - supplier.lastTimestamp);

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

    require(supplier.inStream.flow > 0, "IN_STREAM_NOT_EXISTS");

    if (supplier.outStream.flow != 0) {} else {
      uint256 totalDeposit = supplier.depositAmount +
        uint96(supplier.inStream.flow) *
        (block.timestamp - supplier.lastTimestamp);

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
      supplier.lastTimestamp = block.timestamp;
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
  function _addYield(uint256 yieldAmount) internal {
    DataTypes.Period storage currentPeriod = periodById[periodId.current()];

    if (currentPeriod.flow != 0) {
      ///// trigger re-schauffle
      _poolUpdate();
    }

    currentPeriod.yield = currentPeriod.yield + yieldAmount;
  }

  /**
   * @notice Calculates the TWAP, the yieldshare by active user and push a new  Period
   * @dev This function will be called when liquidity is updated deposit/streamed/withdraw
   *      When yield are added to the pool, if there is active stream this lfunction will be calculated too.
   *      If there is not active stream, the proportion remains the same and the period remains unchanged
   */
  function _poolUpdate() internal {
    if (
      periodId.current() == 0 && periodById[periodId.current()].timestamp == 0
    ) {
      periodById[periodId.current()].timestamp = block.timestamp;
    } else {
      periodId.increment();
      uint256 currentPeriodId = periodId.current();

      uint256 lastPeriodId = currentPeriodId - 1;

      DataTypes.Period storage currentPeriod = periodById[currentPeriodId];
      currentPeriod.timestamp = block.timestamp;
      currentPeriod.periodId = currentPeriodId;

      DataTypes.Period storage lastPeriod = periodById[lastPeriodId];

      uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

      uint256 areaFlow = (uint96(lastPeriod.flow) * (periodSpan**2)) / 2;
      uint256 areaDeposit = lastPeriod.deposit * periodSpan;

      uint256 totalAreaPeriod = areaDeposit;

      if (lastPeriod.flow >= 0) {
        totalAreaPeriod = totalAreaPeriod + areaFlow;
      } else {
        totalAreaPeriod = totalAreaPeriod - areaFlow;
      }

      lastPeriod.periodTWAP = totalAreaPeriod;
      lastPeriod.periodSpan = periodSpan;
      currentPeriod.startTWAP = lastPeriod.startTWAP + lastPeriod.periodTWAP;

      currentPeriod.flow = lastPeriod.flow;
      currentPeriod.deposit =
        (uint96(lastPeriod.flow) * (periodSpan)) +
        lastPeriod.deposit;
    }
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
      supplier.depositAmount +=
        uint96(supplier.inStream.flow) *
        (block.timestamp - supplier.lastTimestamp);
      supplier.inStream.flow = 0;
      supplier.periodId = periodId.current();
      supplier.lastTimestamp = block.timestamp;
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

    if (sender == address(this)) {} else {
      (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

      DataTypes.Supplier storage supplier = suppliersByAddress[sender];

      uint256 supplierId = supplier.supplierId;

      uint256 _periodId = periodId.current();

      //// current stream
      int96 currentStream = supplier.inStream.flow;

      periodById[_periodId].flow = --supplier.inStream.flow;

      supplier.inStream = DataTypes.Stream(0, bytes32(0));
    }
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
