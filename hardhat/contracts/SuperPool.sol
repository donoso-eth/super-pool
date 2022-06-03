//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

contract SuperPool is SuperAppBase, IERC777Recipient {
  using SafeMath for uint256;
  using Counters for Counters.Counter;

  ISuperfluid public host; // host
  IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address
  ISuperToken superToken;

  uint256[] activeSuppliers;

  mapping(address => DataTypes.Supplier) public suppliersByAddress;

  mapping(uint256 => address) supplierAdressById;

  mapping(uint256 => DataTypes.Period) periodById;

  Counters.Counter public periodId;
  Counters.Counter public supplierId;

  DataTypes.Global public spider;

  constructor(ISuperfluid _host, ISuperToken _superToken) {
    host = _host;
    superToken = _superToken;
    cfa = IConstantFlowAgreementV1(
      address(
        host.getAgreementClass(
          keccak256(
            "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
          )
        )
      )
    );

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
      SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

    host.registerApp(configWord);

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

  modifier onlyExpected(ISuperToken superToken, address agreementClass) {
    require(_isSameToken(superToken), "RedirectAll: not accepted token");
    require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
    _;
  }

  // endregion

  // ============= =============  Internal Functions ============= ============= //
  // #region InternalFunctions

  function _getSupplier(address _supplier)
    internal
    returns (DataTypes.Supplier storage)
  {
    //// initialize globals when first user created
    if (periodId.current() == 0) {
      spider = DataTypes.Global(0, 0, 0);
      periodById[0] = DataTypes.Period(0, 0, 0, 0, 0, 0);
    }

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.createdTimestamp == 0) {
      supplier.createdTimestamp == block.timestamp;
      supplier.supplier = _supplier;

      supplierId.increment();
      supplier.supplierId = supplierId.current();

      supplierAdressById[supplier.supplierId] = _supplier;

      activeSuppliers.push(supplier.supplierId);
    }

    periodId.increment();
    supplier.periodId = periodId.current();

    return supplier;
  }

  // #endregion

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

    console.log(from);
    console.log(msg.sender);
    console.log(amount);

    _deposit(from, amount);
  }

  function _calculateReward(DataTypes.Supplier memory supplier) internal {}

  function _calculateRewards() internal {}

  /**
   * @notice Add the rewards to the Period
   * @dev  When rewards are added to the pool, if there is active stream this
   *       function will call _advancePeriod() fucntion
   *       If there is not active stream, the proportion remains the same and the period remains unchanged
   */
  function _addRewards(uint256 rewardAmount) internal {
    DataTypes.Period storage currentPeriod = periodById[periodId.current()];

    currentPeriod.rewards = ++rewardAmount;
    if (currentPeriod.flow != 0) {
      ///// trigger re-schauffle
      _advancePeriod();
    }
  }

  /**
   * @notice Calculates the TWAP, the yieldshare by active user and push a new  Period
   * @dev This function will be called when liquidity is updated deposit/streamed/withdraw
   *      When rewards are added to the pool, if there is active stream this lfunction will be calculated too.
   *      If there is not active stream, the proportion remains the same and the period remains unchanged
   */
  function _advancePeriod() internal {
    uint256 currentPeriodId = periodId.current();
    uint256 lastPeriodId = currentPeriodId - 1;

    DataTypes.Period storage currentPeriod = periodById[currentPeriodId];
    DataTypes.Period memory lastPeriod = periodById[lastPeriodId];

    uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

    uint256 areaFlow = (uint96(lastPeriod.flow) * (periodSpan**2)) / 2;
    uint256 areaDeposit = lastPeriod.deposit * periodSpan;

    uint256 totalAreaPeriod = areaDeposit;

    if (lastPeriod.flow >= 0) {
      totalAreaPeriod = ++areaFlow;
    } else {
      totalAreaPeriod = --areaFlow;
    }

    currentPeriod.startTWAP = lastPeriod.startTWAP + totalAreaPeriod;

    for (uint256 i = 0; i < activeSuppliers.length; i++) {
      DataTypes.Supplier storage activeSupplier = suppliersByAddress[
        supplierAdressById[activeSuppliers[i]]
      ];
      activeSupplier.cumulatedReward = 300;
      activeSupplier.periodId = currentPeriodId;
    }
  }

  function _deposit(address from, uint256 amount) internal {
    require(amount > 0, "AMOUNT_TO_BE_POSITIVE");

    DataTypes.Supplier storage supplier = _getSupplier(from);

    uint256 currentAmount = supplier.deposit.stakedAmount;
    // int96 currentFlow = supplier.stream.flow;

    // //// calcualte previous rewards if already staked;
    // if (currentAmount > 0 || currentFlow > 0) {
    //     _calculateReward(supplier);
    // }

    _advancePeriod();

    supplier.deposit = DataTypes.Deposit(
      currentAmount + amount,
      block.timestamp
    );

    uint256 _periodId = periodId.current();

    periodById[_periodId].deposit = ++amount;

    emit Events.SupplyDepositStarted(from, currentAmount + amount);
  }

  function _stream(address from, int96 flow) internal {
    DataTypes.Supplier storage supplier = _getSupplier(from);

    _advancePeriod();

    int96 currentFlow = supplier.stream.flow;

    supplier.stream = DataTypes.Stream(currentFlow + flow, block.timestamp);
    uint256 _periodId = periodId.current();

    periodById[_periodId].flow = ++currentFlow;

    emit Events.SupplyStreamStarted(from, flow);
  }

  function withdrawStream() public {}

  function withdrawDeposit(uint256 withdrawAmount) public {
    DataTypes.Supplier storage withdrawer = suppliersByAddress[msg.sender];
    uint256 realtimeBalance = withdrawer.deposit.stakedAmount;

    uint256 flowSpan = block.timestamp - withdrawer.stream.initTimestamp;

    if (withdrawer.stream.flow > 0) {
      realtimeBalance = ++flowSpan * uint96(withdrawer.stream.flow);
    } else if (withdrawer.stream.flow < 0) {
      realtimeBalance = --flowSpan * uint96(withdrawer.stream.flow);
    }

    require(realtimeBalance >= withdrawAmount, "NOT_ENOUGH_BALANCE");

    ///// TO DO
    /// REWARDS PAT TO BE ADDEDD
    ISuperToken(superToken).send(msg.sender, withdrawAmount, "0x");
  }

  /**************************************************************************
   * SuperApp callbacks
   *************************************************************************/

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
    onlyExpected(_superToken,_agreementClass)
    onlyHost
    returns (bytes memory newCtx)
  {
    newCtx = _ctx;

    (address sender, address receiver) = abi.decode(
      _agreementData,
      (address, address)
    );

    (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

    console.log(sender);
    console.log(address(superToken));

    _stream(sender, inFlowRate);

    //registerGelato and set call back find stream

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
    (address sender, ) = abi.decode(_agreementData, (address, address));

    _advancePeriod();

    DataTypes.Supplier storage supplier = suppliersByAddress[sender];

    uint256 supplierId = supplier.supplierId;

    uint256 _periodId = periodId.current();

    periodById[_periodId].flow = --supplier.stream.flow;

    supplier.stream = DataTypes.Stream(0, block.timestamp);

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

    (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));



    DataTypes.Supplier storage supplier = suppliersByAddress[sender];

    uint256 supplierId = supplier.supplierId;

    uint256 _periodId = periodId.current();

    //// current stream
    int96 currentStream = supplier.stream.flow; 

    periodById[_periodId].flow = --supplier.stream.flow;

    supplier.stream = DataTypes.Stream(0, block.timestamp);



  }

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
