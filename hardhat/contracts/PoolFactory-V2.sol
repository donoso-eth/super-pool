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
import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";
import {IGelatoResolverV2} from "./interfaces/IGelatoResolver-V2.sol";
import {ISettingsV2} from "./interfaces/ISettings-V2.sol";

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

  Counters.Counter public poolId;
  Counters.Counter public supplierId;

  address public ops;
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
  IGelatoResolverV2 gelatoResolver;
  ISettingsV2 settings;

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
    poolByTimestamp[block.timestamp] = DataTypes.PoolV2(0, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

    poolTimestampById[0] = block.timestamp;

    //// super app && superfluid
    host = poolFactoryInitializer.host;
    superToken = poolFactoryInitializer.superToken;
    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
    token = poolFactoryInitializer.token;
    sToken = poolFactoryInitializer.sToken;
    poolStrategy = poolFactoryInitializer.poolStrategy;
    gelatoResolver = poolFactoryInitializer.gelatoResolver;
    settings = poolFactoryInitializer.settings;

    MAX_INT = 2**256 - 1;

    token.approve(address(poolStrategy), MAX_INT);
    superToken.approve(address(poolStrategy), MAX_INT);

    _cfaLib = CFAv1Library.InitData(host, cfa);

    //// gelato
    ops = poolFactoryInitializer.ops;
    gelato = IOps(poolFactoryInitializer.ops).gelato();

    //// tokens receie implementation
    IERC1820Registry _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
    bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

    _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));

    PRECISSION = settings.getPrecission();

    ///// initializators
  }

  function getPool(uint256 _poolId) external view returns (DataTypes.PoolV2 memory) {
    return poolByTimestamp[_poolId];
  }

  function getLastPool() external view returns (DataTypes.PoolV2 memory) {
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
    uint256 outDeposit,
    uint256 outAssets
  ) external onlySToken {
    DataTypes.Supplier memory supplierTo = _getSupplier(_supplier);

    supplierTo.deposit = supplierTo.deposit + (outAssets * PRECISSION) - (inDeposit * PRECISSION);

    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + (outAssets * PRECISSION) - (inDeposit * PRECISSION);
    _updateSupplierDeposit(_supplier, inDeposit, outDeposit, outAssets);
  }

  function pushedToStrategy(uint256 amount) external onlyPoolStrategy {

    _poolUpdateCurrentState();
    console.log(block.timestamp);
    console.log(lastPoolTimestamp);
    DataTypes.PoolV2 storage pool = poolByTimestamp[lastPoolTimestamp];
   pool.yieldSnapshot += amount;

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

    console.log("tokens_reveived : ",amount );

    _deposit(from, from, amount);
  }

  function _deposit(
    address from,
    address receiver,
    uint256 assets
  ) internal {
    //// retrieve supplier or create a record for the new one
    // _getSupplier(from);

    //// Update pool state "pool Struct" calculating indexes and timestamp
    _poolUpdateCurrentState();

    ///// suppler config updated && pool
    _updateSupplierDeposit(from, assets, 0, 0);

    /// Events mnot yet implemented
  }

  function redeemDeposit(uint256 redeemAmount) external {
    uint256 shares = sToken.balanceOfShares(msg.sender);

    address supplier = msg.sender;

    require(shares > redeemAmount, "NOT_ENOUGH_BALANCE");

    if (shares == redeemAmount) {
      _redeemAll(msg.sender, false);
    } else {
      //// Update pool state "pool Struct" calculating indexes and timestamp
      _poolUpdateCurrentState();

      uint256 outAssets = 0;
      uint256 myShares = sToken.balanceOfShares(supplier);
      uint256 total = sToken.getSupplierBalance(supplier);
      uint256 factor = total.div(myShares);
      outAssets = factor.mul(redeemAmount).div(PRECISSION);

      poolStrategy.withdraw(outAssets);
      //ISuperToken(superToken).send(supplier, outAssets, "0x");

      ///// suppler config updated && pool
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

  function totalYieldEarnedSupplier(address _supplier) public view returns (uint256 yieldSupplier) {
    uint256 yieldTilllastPool = _calculateYieldSupplier(_supplier);

    uint yieldAccruedSincelastPool = poolStrategy.getMockYieldSinceLastTimeStmap();

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool);

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream.flow) * yieldInFlowRateIndex;

    yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow;
  }

  // #endregion

  // #region  ============= =============  Internal Supplier Functions ============= ============= //

  function _getSupplier(address _supplier) internal returns (DataTypes.Supplier storage) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    console.log(347,supplier.createdTimestamp );

    if (supplier.createdTimestamp == 0) {
      supplier.createdTimestamp = block.timestamp;
      supplier.supplier = _supplier;
      supplier.timestamp = block.timestamp;
      supplierId.increment();
      uint256 current = supplierId.current();
      console.log(352,current );
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
      uint256 supplierShares = sToken.balanceOfShares(_supplier);

      supplier.shares = supplierShares;

      int256 supplierDepositUpdate = int256(supplierBalance) - int256(supplier.deposit);

      uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier);

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
    uint256 outDeposit,
    uint256 outAssets
  ) internal {
    DataTypes.Supplier storage supplier = _getSupplier(_supplier);

    _supplierUpdateCurrentState(_supplier);

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;
    //////// if newnetFlow < 0 means  there is already a stream out

    supplier.shares = supplier.shares + inDeposit - outDeposit;

    supplier.deposit = supplier.deposit + inDeposit * PRECISSION - outAssets * PRECISSION;

    poolByTimestamp[block.timestamp].totalShares = poolByTimestamp[block.timestamp].totalShares + inDeposit - outDeposit;
    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outAssets * PRECISSION;


    if (netFlow < 0) {
      uint256 total = supplier.deposit; //_getSupplierBalance(_supplier);
      uint256 factor = total.div(supplier.shares);
      int96 updatedOutAssets = int96(int256(factor.mul(uint96(supplier.outStream.flow)).div(PRECISSION)));
      poolByTimestamp[block.timestamp].outFlowAssetsRate = poolByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow + updatedOutAssets;
      poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit - supplier.deposit;
      _outStreamHasChanged(_supplier, -netFlow, updatedOutAssets);
    }

    emit Events.SupplierUpdate(supplier);
    console.log("event");
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

        poolByTimestamp[block.timestamp].outFlowAssetsRate = poolByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow;

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
        uint256 factor = supplier.deposit.div(supplier.shares);
        int96 outAssets = int96(int256((factor).mul(uint256(uint96(-newNetFlow))).div(PRECISSION)));
        poolByTimestamp[block.timestamp].outFlowRate = poolByTimestamp[block.timestamp].outFlowRate + currentNetFlow - newNetFlow;
        poolByTimestamp[block.timestamp].outFlowAssetsRate = poolByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow + outAssets;

        poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit - supplier.deposit;

        //  supplier.outAssets = DataTypes.Stream(outAssets, bytes32(0));
        //// creatre timed task
        _outStreamHasChanged(_supplier, -newNetFlow, outAssets);
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

      if (newNetFlow >= 0) {
        poolByTimestamp[block.timestamp].inFlowRate = poolByTimestamp[block.timestamp].inFlowRate - currentNetFlow + inFlow;
      } else {
        /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

        uint256 factor = supplier.deposit.div(supplier.shares);

        int96 outAssets = int96(int256((factor).mul(uint256(uint96(-newNetFlow))).div(PRECISSION)));

        poolByTimestamp[block.timestamp].outFlowAssetsRate = poolByTimestamp[block.timestamp].outFlowAssetsRate + outAssets;

        poolByTimestamp[block.timestamp].outFlowRate += -newNetFlow;
        poolByTimestamp[block.timestamp].inFlowRate -= currentNetFlow;

        poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit - supplier.deposit;

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

    uint256 yieldFromDeposit = (supplier.deposit * (poolByTimestamp[lastPoolTimestamp].yieldTokenIndex - poolByTimestamp[lastTimestamp].yieldTokenIndex)).div(PRECISSION);

    yieldSupplier = yieldFromDeposit;
    if (supplier.inStream.flow > 0) {
      ///// Yield from flow
      uint256 yieldFromFlow = uint96(supplier.inStream.flow) * (poolByTimestamp[lastPoolTimestamp].yieldInFlowRateIndex - poolByTimestamp[lastTimestamp].yieldInFlowRateIndex);

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

    supplier.outAssets.stepAmount = supplier.deposit.div(PARTIAL_DEPOSIT);

    supplier.outAssets.stepTime = 50;

    supplier.outAssets.cancelWithdrawId = gelatoResolver.createWithdraStepTask(_supplier, supplier.outAssets.stepTime);

    ///
  }

  function _redeemAll(address _supplier, bool closeInStream) internal {
    //// Update pool state "pool Struct" calculating indexes and timestamp
    _poolUpdateCurrentState();

    _supplierUpdateCurrentState(_supplier);

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    poolByTimestamp[block.timestamp].totalShares = poolByTimestamp[block.timestamp].totalShares - supplier.shares;
    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit - supplier.deposit;

    uint256 withdrawalAmount = supplier.deposit.div(PRECISSION);

    poolStrategy.withdraw(withdrawalAmount);
    ISuperToken(superToken).send(_supplier, withdrawalAmount, "0x");
    supplier.shares = 0;
    supplier.deposit = 0;

    if (supplier.outStream.flow > 0) {
      poolByTimestamp[block.timestamp].outFlowRate = poolByTimestamp[block.timestamp].outFlowRate - supplier.outStream.flow;
      poolByTimestamp[block.timestamp].outFlowAssetsRate = poolByTimestamp[block.timestamp].outFlowAssetsRate - supplier.outAssets.flow;
      _cfaLib.deleteFlow(address(this), _supplier, superToken);
      supplier.outAssets = DataTypes.OutAssets(0, bytes32(0), 0, 0, bytes32(0));
      supplier.outStream = DataTypes.Stream(0, bytes32(0));
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

  function _poolUpdateCurrentState() public {
    poolId.increment();

    DataTypes.PoolV2 memory currentPool = DataTypes.PoolV2(poolId.current(), block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

    DataTypes.PoolV2 memory lastPool = poolByTimestamp[lastPoolTimestamp];

    uint256 periodSpan = currentPool.timestamp - lastPool.timestamp;

  console.log(610, periodSpan);


   if (periodSpan >0) {

    currentPool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;

    currentPool.deposit = lastPool.deposit;
    

    currentPool.yieldSnapshot = poolStrategy.balanceOf();
    console.log(620, currentPool.yieldSnapshot);

    currentPool.yieldAccrued= currentPool.yieldSnapshot - lastPool.yieldSnapshot;

    currentPool.totalYield += currentPool.yieldAccrued;


    currentPool.apy.span = lastPool.apy.span + periodSpan;
    uint periodApy;
    periodApy = lastPool.totalShares == 0 ? 0 :currentPool.yieldAccrued
    .mul(365*24*3600*100)
    .div(periodSpan)
    .div(lastPool.totalShares);


   currentPool.apy.apy = ((periodSpan.mul(periodApy))
          .add(lastPool.apy.span.mul(lastPool.apy.apy))).
          div( currentPool.apy.span);

    (currentPool.yieldTokenIndex, currentPool.yieldInFlowRateIndex) = _calculateIndexes( currentPool.yieldAccrued );


    currentPool.yieldTokenIndex = currentPool.yieldTokenIndex + lastPool.yieldTokenIndex;
    currentPool.yieldInFlowRateIndex = currentPool.yieldInFlowRateIndex + lastPool.yieldInFlowRateIndex;

    currentPool.totalShares = lastPool.totalShares + uint96(lastPool.inFlowRate) * periodSpan - uint96(lastPool.outFlowRate) * periodSpan;

    currentPool.outFlowAssetsRate = lastPool.outFlowAssetsRate;

    currentPool.inFlowRate = lastPool.inFlowRate;
    currentPool.outFlowRate = lastPool.outFlowRate;

    currentPool.timestamp = block.timestamp;

    poolByTimestamp[block.timestamp] = currentPool;

    lastPoolTimestamp = block.timestamp;

    poolTimestampById[poolId.current()] = block.timestamp;

   }
     console.log(622,currentPool.deposit);
    console.log("pool_update");
  }

  function _calculateIndexes(uint256 yieldPeriod) internal view returns (uint256 periodYieldTokenIndex, uint256 periodYieldInFlowRateIndex) {
    DataTypes.PoolV2 memory lastPool = poolByTimestamp[lastPoolTimestamp];

    uint256 periodSpan = block.timestamp - lastPool.timestamp;

    uint256 dollarSecondsInFlow = ((uint96(lastPool.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromInFlowRate * periodSpan;
    uint256 dollarSecondsDeposit = lastPool.deposit * periodSpan;

    uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow;


    /// we ultiply by PRECISSION for 5 decimals precision

    if (totalAreaPeriod == 0 || yieldPeriod == 0) {
      periodYieldTokenIndex = 0;
      periodYieldInFlowRateIndex = 0;
    } else {
      uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
      uint256 depositContribution = (dollarSecondsDeposit * PRECISSION * PRECISSION);
      if (lastPool.deposit != 0) {
        periodYieldTokenIndex = ((depositContribution * yieldPeriod).div((lastPool.deposit) * totalAreaPeriod));
      }
      if (lastPool.inFlowRate != 0) {
        periodYieldInFlowRateIndex = ((inFlowContribution * yieldPeriod).div(uint96(lastPool.inFlowRate) * totalAreaPeriod));
      }
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

    if (supplier.deposit < supplier.outAssets.stepAmount) {
      withdrawalAmount = supplier.deposit;
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

  modifier onlyPoolStrategy() {
    require(msg.sender == address(poolStrategy), "Only Strategy");
    _;
  }

  modifier onlySToken() {
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
