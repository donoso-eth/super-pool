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
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

import {IERC4626} from "./interfaces/IERC4626.sol";

import {IAllocationMock} from "./interfaces/IAllocation-mock.sol";

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
contract PoolFactoryV2 is ERC20Upgradeable, SuperAppBase, IERC777Recipient {
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

  address mockYieldSupplier;

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

  address MOCK_ALLOCATION;
  uint256 public DEPOSIT_TRIGGER_AMOUNT = 0;
  uint256 public DEPOSIT_TRIGGER_TIME = 3600;
  bytes32 public DepositTaksId;
  IERC20 token;

  // #endregion pool state

  //// ERC4626 EVents
  constructor() {}

  /**
   * @notice initializer of the Pool
   */
  function initialize(DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer) external initializer {
    ///initialState
    __ERC20_init("sTK", "STOKE");

    lastPeriodTimestamp = block.timestamp;
    periodByTimestamp[block.timestamp] = DataTypes.PeriodV2(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    periodTimestampById[0] = block.timestamp;

    //// super app && superfluid
    host = poolFactoryInitializer.host;
    superToken = poolFactoryInitializer.superToken;
    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
    token = poolFactoryInitializer.token;

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

  function getPeriod(uint256 _periodId) public view returns (DataTypes.PeriodV2 memory) {
    return periodByTimestamp[_periodId];
  }

  function poolUpdate() public {
    _poolUpdateCurrentState();
  }



  // #region  ============= ============= Mock Allocatio Strategy  ============= ============= //

  function setUpMock(address _mock) public {
    MOCK_ALLOCATION = _mock;
    token.approve(MOCK_ALLOCATION, MAX_INT);
    DepositTaksId =  createDepositTask();
  }

  function upgrade(uint256 amount) public {
    superToken.upgrade(amount);
  }

  function downgrade(uint256 amount) public {
    superToken.downgrade(amount);
  }

  function getBalanceSuperToken() public view returns (int256 balance) {
    (balance, , , ) = superToken.realtimeBalanceOfNow(address(this));
  }

  function getBalanceToken() public view returns (uint256 balance) {
    balance = token.balanceOf(address(this));
  }

  function calculateStatus() public {
    uint256 increment = IAllocationMock(MOCK_ALLOCATION).calculateStatus();
  }

  function _withdrawMock(uint256 requiredAmount) internal {
    int256 availableBalance = int256(getBalanceSuperToken()) - int256(poolBuffer);
    uint256 withdrawalAmount;
    if (availableBalance <= 0) {
      withdrawalAmount = uint256(-availableBalance) + requiredAmount;
      IAllocationMock(MOCK_ALLOCATION).withdraw(withdrawalAmount);
      superToken.upgrade(withdrawalAmount);
    } else if (uint256(availableBalance) < requiredAmount) {
      withdrawalAmount = requiredAmount - uint256(availableBalance);
      IAllocationMock(MOCK_ALLOCATION).withdraw(withdrawalAmount);
      superToken.upgrade(withdrawalAmount);
    }
  }

  function createDepositTask() internal returns (bytes32 taskId) {
    taskId = IOps(ops).createTaskNoPrepayment(
      address(this), 
      this.depositMock.selector, 
      address(this), 
      abi.encodeWithSelector(this.checkerDepositMock.selector), ETH);
  }

  // called by Gelato Execs
  function checkerDepositMock(
  ) external view returns (bool canExec, bytes memory execPayload) {
    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(this));

  
    canExec = uint256(balance) - poolBuffer >= 0.5 ether;

    execPayload = abi.encodeWithSelector(this.depositMock.selector);
  }

  function depositMock() external onlyOps {
    uint256 fee;
    address feeToken;

    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(this));

    console.log(215,uint(balance));
    uint256 amountToDeposit = uint256(balance) - poolBuffer;
    console.log(216,amountToDeposit);
    require(amountToDeposit >= 0.5 ether, "NOT_ENOUGH_FUNDS_TO DEPOSIT");

    (fee, feeToken) = IOps(ops).getFeeDetails();

    _transfer(fee, feeToken);

    superToken.downgrade(amountToDeposit);
    IAllocationMock(MOCK_ALLOCATION).deposit(amountToDeposit);
  }

  // #endregion  ============= ============= Mock Allocatio Strategy  ============= ============= //

  // #region  ============= =============  ERC20  ============= ============= //
  /****************************************************************************************************
   * @notice ERC20 overrides
   *
   * ---- balanceOf
   * ---- _transfer
   * ---- totalSupply()
   *
   ****************************************************************************************************/
  function balanceOf(address _supplier) public view override returns (uint256 _shares) {
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];
    _shares = supplier.shares;

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      _shares = _shares + uint96(netFlow) * (block.timestamp - supplier.timestamp);
    } else {
      _shares = _shares - uint96(-netFlow) * (block.timestamp - supplier.timestamp);
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
    require(fromBalance >= amount, "ERC20: transfer amount exceeds balance");

    _poolUpdateCurrentState();

    uint256 myShares = balanceOf(from);

    uint256 total = _getSupplierBalance(from);
    uint256 factor = total.div(myShares);
    uint256 outAssets = factor.mul(amount).div(PRECISSION);

    _updateSupplierDeposit(from, 0, amount, outAssets);

    // periodByTimestamp[block.timestamp].totalShares = periodByTimestamp[block.timestamp].totalShares + amount;
    // periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + outAssets * PRECISSION;

    _supplierUpdateCurrentState(to);

    DataTypes.Supplier storage supplierTo = _getSupplier(to);

    // supplierTo.shares = supplierTo.shares + amount;
    supplierTo.deposit.amount = supplierTo.deposit.amount + (outAssets * PRECISSION) - (amount * PRECISSION);
    periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + (outAssets * PRECISSION) - (amount * PRECISSION);
    _updateSupplierDeposit(to, amount, 0, 0);

    emit Transfer(from, to, amount);

    _afterTokenTransfer(from, to, amount);
  }

  function totalSupply() public view override returns (uint256) {
    DataTypes.PeriodV2 memory lastPeriod = periodByTimestamp[lastPeriodTimestamp];
    uint256 periodSpan = block.timestamp - lastPeriod.timestamp;
    uint256 _totalSupply = lastPeriod.totalShares + uint96(lastPeriod.inFlowRate) * periodSpan - uint96(lastPeriod.outFlowRate) * periodSpan;

    return _totalSupply;
  }

  // endregion overriding ERC20

  // #region  ============= =============  ERC4626 Interface  ============= ============= //
  /****************************************************************************************************
   * @notice ERC20 & ERC4626 & interface skstructure (tbd if is needed)
   *
   * ---- NOT YET READY
   *
   *
   *
   ****************************************************************************************************/

  // function deposit(uint256 assets, address receiver) external override returns (uint256 shares) {
  //   ERC20(address(superToken)).transferFrom(msg.sender, address(this), assets);
  //   _deposit(msg.sender, receiver, assets);
  //   shares = assets;
  // }

  // function asset() external view override returns (address assetTokenAddress) {
  //   assetTokenAddress = address(this);
  // }

  // function totalAssets() external view override returns (uint256 totalManagedAssets) {
  //   totalManagedAssets = ISuperToken(superToken).balanceOf(address(this));
  // }

  // function convertToShares(uint256 assets) external pure override returns (uint256 shares) {
  //   shares = assets;
  // }

  // function convertToAssets(uint256 shares) external pure override returns (uint256 assets) {
  //   assets = shares;
  // }

  // function maxDeposit(address receiver) external pure override returns (uint256 maxAssets) {
  //   maxAssets = type(uint256).max;
  // }

  // #endregion ERC4626 Interface

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
    uint256 shares = balanceOf(msg.sender);

    address supplier = msg.sender;

    require(shares > redeemAmount, "NOT_ENOUGH_BALANCE");

    if (shares == redeemAmount) {
      _redeemAll(msg.sender, false);
    } else {
      //// Update pool state "period Struct" calculating indexes and timestamp
      _poolUpdateCurrentState();

      uint256 outAssets = 0;
      uint256 myShares = balanceOf(supplier);
      uint256 total = _getSupplierBalance(supplier);
      uint256 factor = total.div(myShares);
      outAssets = factor.mul(redeemAmount).div(PRECISSION);

      _withdrawMock(outAssets);
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

    uint256 realTimeBalance = _getSupplierBalance(msg.sender);

    require(realTimeBalance > 0, "NO_BALANCE");

    _poolUpdateCurrentState();

    bytes memory placeHolder = "0x";

    _updateSupplierFlow(msg.sender, 0, _outFlowRate, placeHolder);
    console.log(355, _endSeconds);
    if (_endSeconds > 0) {
      cancelTask(supplier.outAssets.cancelTaskId);
      supplier.outAssets.cancelTaskId = creareStopStreamTimedTask(msg.sender, _endSeconds - MIN_OUTFLOW_ALLOWED, false, 0);
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
  /**
   * @notice Calculate the total balance of a user/supplier
   * @dev it calculate the yield earned and add the total deposit (send+stream)
   * @return balance the realtime balance multiplied
   */
  function totalBalanceSupplier(address _supplier) public  returns (uint256 balance) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    balance = _getSupplierBalance(_supplier).div(PRECISSION);
  }
 
  function totalYieldEarnedSupplier(address _supplier) public returns (uint256 yieldSupplier) {
    uint256 yieldTillLastPeriod = _calculateYieldSupplier(_supplier);

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex, uint256 yieldOutFlowRateIndex) = _calculateIndexes();

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.amount.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream.flow) * yieldInFlowRateIndex;
    uint256 yieldOutFlow = 0;//(yieldOutFlowRateIndex) * (uint256(uint96(supplier.outStream.flow))).div(PRECISSION);

    yieldSupplier = yieldTillLastPeriod + yieldDeposit + yieldInFlow + yieldOutFlow;
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

  /**
   * @notice Calculate the total balance of a user/supplier
   * @dev it calculate the yield earned and add the total deposit (send+stream)
   * @return realtimeBalance the realtime balance multiplied by precission (10**6)
   */
  function _getSupplierBalance(address _supplier) internal  returns (uint256 realtimeBalance) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier);

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      realtimeBalance = yieldSupplier + (supplier.deposit.amount) + uint96(netFlow) * (block.timestamp - supplier.timestamp) * PRECISSION;
    } else {
      realtimeBalance = yieldSupplier + (supplier.deposit.amount) - uint96(supplier.outAssets.flow) * (block.timestamp - supplier.timestamp) * PRECISSION;
    }
  }

  function _supplierUpdateCurrentState(address _supplier) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.timestamp < block.timestamp) {
      uint256 supplierBalance = _getSupplierBalance(_supplier);
      uint256 supplierShares = balanceOf(_supplier);

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
      } else if (netFlow < 0) {
        periodByTimestamp[block.timestamp].depositFromOutFlowRate =
          periodByTimestamp[block.timestamp].depositFromOutFlowRate +
          uint96(supplier.outAssets.flow) *
          (block.timestamp - supplier.timestamp) *
          PRECISSION -
          supplier.deposit.amount;

        periodByTimestamp[block.timestamp].deposit = periodByTimestamp[block.timestamp].deposit + supplierBalance;
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
    console.log(603,periodByTimestamp[block.timestamp].deposit);
    console.log(603,inDeposit);
    if (netFlow < 0) {
      uint256 total = supplier.deposit.amount; //_getSupplierBalance(_supplier);
      uint256 factor = total.div(supplier.shares);
      int96 updatedOutAssets = int96(int256(factor.mul(uint96(supplier.outStream.flow)).div(PRECISSION)));
      periodByTimestamp[block.timestamp].outFlowAssetsRate = periodByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow + updatedOutAssets;
      periodByTimestamp[block.timestamp].depositFromOutFlowRate = periodByTimestamp[block.timestamp].depositFromOutFlowRate + supplier.deposit.amount;
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
        periodByTimestamp[block.timestamp].depositFromOutFlowRate = periodByTimestamp[block.timestamp].depositFromOutFlowRate + supplier.deposit.amount;

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
        periodByTimestamp[block.timestamp].depositFromOutFlowRate = periodByTimestamp[block.timestamp].depositFromOutFlowRate + supplier.deposit.amount;

        _outStreamHasChanged(_supplier, -newNetFlow, outAssets);
      }
    }

    supplier.inStream.flow = inFlow;
    supplier.outStream.flow = outFlow;

    console.log("updateSupplierFlow");
  }

  function _calculateYieldSupplier(address _supplier) internal view returns (uint256 yieldSupplier) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

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
    supplier.outAssets.cancelTaskId = creareStopStreamTimedTask(_supplier, endMs - MIN_OUTFLOW_ALLOWED, true, 0);

    supplier.outAssets.stepAmount = supplier.deposit.amount.div(PARTIAL_DEPOSIT);

    supplier.outAssets.stepTime = 50;

    supplier.outAssets.cancelWithdrawId =  createWithdraStepTask(_supplier, supplier.outAssets.stepTime);

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

    _withdrawMock(withdrawalAmount);
    ISuperToken(superToken).send(_supplier, withdrawalAmount, "0x");
    supplier.shares = 0;
    supplier.deposit.amount = 0;

    if (supplier.outStream.flow > 0) {
      periodByTimestamp[block.timestamp].outFlowRate = periodByTimestamp[block.timestamp].outFlowRate - supplier.outStream.flow;
      periodByTimestamp[block.timestamp].outFlowAssetsRate = periodByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow;
      _cfaLib.deleteFlow(address(this), _supplier, superToken);
      supplier.outAssets = DataTypes.OutAssets(0, bytes32(0), 0,0, bytes32(0));
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

  function _poolUpdateCurrentState() public {
    periodId.increment();

    DataTypes.PeriodV2 memory currentPeriod = DataTypes.PeriodV2(block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);

    DataTypes.PeriodV2 memory lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

    currentPeriod.depositFromInFlowRate = uint96(lastPeriod.inFlowRate) * PRECISSION * periodSpan + lastPeriod.depositFromInFlowRate;
    currentPeriod.depositFromOutFlowRate = lastPeriod.depositFromOutFlowRate - uint96(lastPeriod.outFlowAssetsRate) * periodSpan * PRECISSION;

    currentPeriod.deposit = lastPeriod.deposit;
    (currentPeriod.yieldTokenIndex, currentPeriod.yieldInFlowRateIndex, currentPeriod.yieldOutFlowRateIndex) = _calculateIndexes();

    currentPeriod.yieldTokenIndex = currentPeriod.yieldTokenIndex + lastPeriod.yieldTokenIndex;
    currentPeriod.yieldInFlowRateIndex = currentPeriod.yieldInFlowRateIndex + lastPeriod.yieldInFlowRateIndex;
    currentPeriod.yieldOutFlowRateIndex = currentPeriod.yieldOutFlowRateIndex + lastPeriod.yieldOutFlowRateIndex;

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

    returns (
      uint256 periodYieldTokenIndex,
      uint256 periodYieldInFlowRateIndex,
      uint256 periodYieldOutFlowRateIndex
    )
  {
    DataTypes.PeriodV2 storage lastPeriod = periodByTimestamp[lastPeriodTimestamp];

    uint256 periodSpan = block.timestamp - lastPeriod.timestamp;

    uint256 dollarSecondsInFlow = ((uint96(lastPeriod.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPeriod.depositFromInFlowRate * periodSpan;
    uint256 dollarSecondsOutFlow = 0; //0lastPeriod.depositFromOutFlowRate * periodSpan - (uint96(lastPeriod.outFlowAssetsRate) * PRECISSION * (periodSpan**2)) / 2;
    uint256 dollarSecondsDeposit = lastPeriod.deposit * periodSpan;

    uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow + dollarSecondsOutFlow;

    uint256 yieldPeriod = _calculatePoolYieldPeriod();

    /// we ultiply by PRECISSION for 5 decimals precision

    if (totalAreaPeriod == 0 || yieldPeriod == 0) {
      periodYieldTokenIndex = 0;
      periodYieldInFlowRateIndex = 0;
      periodYieldOutFlowRateIndex = 0;
    } else {
      uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
      uint256 outFlowContribution = (dollarSecondsOutFlow * PRECISSION);
      uint256 depositContribution = (dollarSecondsDeposit * PRECISSION * PRECISSION);
      if (lastPeriod.deposit != 0) {
        periodYieldTokenIndex = ((depositContribution * yieldPeriod).div((lastPeriod.deposit) * totalAreaPeriod));
      }
      if (lastPeriod.inFlowRate != 0) {
        periodYieldInFlowRateIndex = ((inFlowContribution * yieldPeriod).div(uint96(lastPeriod.inFlowRate) * totalAreaPeriod));
      }
      if (lastPeriod.outFlowAssetsRate != 0) {
        periodYieldOutFlowRateIndex = 0;// ((outFlowContribution * yieldPeriod).div(uint96(lastPeriod.outFlowAssetsRate) * totalAreaPeriod));
      }
    }
  }

  function _calculatePoolYieldPeriod() internal returns (uint256 yield) {
   // yield = (block.timestamp - lastPeriodTimestamp) * periodByTimestamp[lastPeriodTimestamp].yieldAccruedSec;

    yield = IAllocationMock(MOCK_ALLOCATION).calculateStatus();
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

  function creareStopStreamTimedTask(
    address _supplier,
    uint256 _stopDateInMs,
    bool _all,
    uint8 _flowType
  ) internal returns (bytes32 taskId) {
    taskId = IOps(ops).createTimedTask(
      uint128(block.timestamp + _stopDateInMs),
      600,
      address(this),
      this.stopstream.selector,
      address(this),
      abi.encodeWithSelector(this.checkerStopStream.selector, _supplier, _all, _flowType),
      ETH,
      false
    );
  }

  // called by Gelato Execs
  function checkerStopStream(
    address _receiver,
    bool _all,
    uint8 _flowType
  ) external returns (bool canExec, bytes memory execPayload) {
    canExec = true;

    execPayload = abi.encodeWithSelector(this.stopstream.selector, address(_receiver), _all, _flowType);
  }

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

  //// Withdrawal step task
  function createWithdraStepTask(
    address _supplier,
    uint256 _stepTime
  ) internal returns (bytes32 taskId) {
    taskId = IOps(ops).createTimedTask(
      uint128(block.timestamp + _stepTime),
      uint128(_stepTime),
      address(this),
      this.withdrawStep.selector,
      address(this),
      abi.encodeWithSelector(this.checkerwithdrawStep.selector, _supplier),
      ETH,
      false
    );
  }

  // called by Gelato Execs
  function checkerwithdrawStep(
    address _receiver
  ) external returns (bool canExec, bytes memory execPayload) {
    canExec = true;

    execPayload = abi.encodeWithSelector(this.withdrawStep.selector, address(_receiver));
  }

  /// called by Gelato
  function withdrawStep(
    address _receiver
  ) external onlyOps {
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
    _withdrawMock(withdrawalAmount);
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
    ISuperfluid.Context memory decodedContext = host.decodeCtx(_ctx);

    //// If In-Stream we will request a pool update
    console.log(decodedContext.userData.length);
    if (receiver == address(this)) {
      console.log(963);
      console.logBytes(host.decodeCtx(_ctx).userData);
      if (decodedContext.userData.length > 0) {
        DataTypes.Supplier storage supplier = suppliersByAddress[sender];
        uint256 endSeconds = parseLoanData(host.decodeCtx(_ctx).userData);
        console.logBytes(host.decodeCtx(_ctx).userData);
        console.log(sender);
        supplier.inStream.cancelTaskId = creareStopStreamTimedTask(sender, endSeconds - MIN_OUTFLOW_ALLOWED, false, 1);
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
