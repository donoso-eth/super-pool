//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {UUPSProxiable} from "./upgradability/UUPSProxiable.sol";

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {ISuperToken, ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {IOps} from "./gelato/IOps.sol";
import { LibDataTypes} from './gelato/LibDataTypes.sol';

import {ISTokenV1} from "./interfaces/ISToken-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";

import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import {IPoolV1} from "./interfaces/IPool-V1.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

contract PoolInternalV1 is UUPSProxiable {
  using SafeMath for uint256;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  address owner;

  uint256 poolId;
  uint256 supplierId;

  IPoolV1 poolContract;
  ISTokenV1 sToken;
  IPoolStrategyV1 poolStrategy;



  ISuperToken superToken;

  mapping(address => DataTypes.Supplier) public suppliersByAddress;

  mapping(uint256 => address) supplierAdressById;

  mapping(uint256 => DataTypes.PoolV1) public poolByTimestamp;

  mapping(uint256 => uint256) public poolTimestampById;

  uint256 public lastPoolTimestamp;

  uint256 public PRECISSION;
  // 1 hour minimum flow == Buffer
  uint8 public STEPS; // proportinal decrease deposit
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public SUPERFLUID_DEPOSIT;
  uint56 public MIN_OUTFLOW_ALLOWED;
  IOps public ops;

  function proxiableUUID() public view override returns (bytes32) {
    return keccak256("org.super-pool.pool-internal.v2");
  }

  function updateCode(address newAddress) external override {
    require(msg.sender == owner, "only owner can update code");
    return _updateCodeAddress(newAddress);
  }

  /**
   * @notice initializer of the Pool
   */
  function initialize( DataTypes.PoolInternalInitializer memory  internalInit ) external initializer {
    ///initialState

    owner = internalInit.owner;
     superToken = internalInit.superToken;

    sToken = internalInit.sToken;
    poolStrategy = internalInit.poolStrategy;
    poolContract = internalInit.pool;

    ops = internalInit.ops;

    lastPoolTimestamp = block.timestamp;
    poolByTimestamp[block.timestamp] = DataTypes.PoolV1(0, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

    poolTimestampById[0] = block.timestamp;

    PRECISSION = poolContract.getPrecission();

    STEPS = poolContract.getSteps();
    SUPERFLUID_DEPOSIT = poolContract.getSuperfluidDeposit();
    POOL_BUFFER = poolContract.getPoolBuffer();
    MIN_OUTFLOW_ALLOWED = 3600;

   
  }


  function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier) {
    supplier = suppliersByAddress[_supplier];
  }

  function getPool(uint256 timestamp) external view returns (DataTypes.PoolV1 memory pool) {
    pool = poolByTimestamp[timestamp];
  }

  function getLastPool() external view returns (DataTypes.PoolV1 memory pool) {
    pool = poolByTimestamp[lastPoolTimestamp];
  }

  function getLastTimestmap() external view returns (uint256) {
    return lastPoolTimestamp;
  }

  // ============= ============= POOL UPDATE ============= ============= //
  // #region Pool Update

  /**************************************************************************
   * Pool Update
   *
   *************************************************************************/

  function _poolUpdate() public {
    DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];

    uint256 periodSpan = block.timestamp - lastPool.timestamp;

    uint256 currentYieldSnapshot = poolStrategy.balanceOf();

    if (periodSpan > 0) {
      poolId++;

      DataTypes.PoolV1 memory pool = DataTypes.PoolV1(poolId, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

      pool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;

      pool.deposit = lastPool.deposit;

      pool.nrSuppliers = supplierId;

      pool.yieldSnapshot = currentYieldSnapshot;

      pool.yieldAccrued = pool.yieldSnapshot - lastPool.yieldSnapshot;

      pool.totalYield = lastPool.totalYield + pool.yieldAccrued;

      pool.apy.span = lastPool.apy.span + periodSpan;
      uint256 periodApy;

      periodApy = lastPool.deposit == 0 ? 0 : pool.yieldAccrued.mul(365 * 24 * 3600 * 100).div(periodSpan).div(lastPool.deposit);

      pool.apy.apy = ((periodSpan.mul(periodApy)).add(lastPool.apy.span.mul(lastPool.apy.apy))).div(pool.apy.span);

      (pool.yieldTokenIndex, pool.yieldInFlowRateIndex) = _calculateIndexes(pool.yieldAccrued, lastPool);

      pool.yieldTokenIndex = pool.yieldTokenIndex + lastPool.yieldTokenIndex;
      pool.yieldInFlowRateIndex = pool.yieldInFlowRateIndex + lastPool.yieldInFlowRateIndex;

      pool.inFlowRate = lastPool.inFlowRate;
      pool.outFlowRate = lastPool.outFlowRate;
      pool.outFlowBuffer = lastPool.outFlowBuffer;

      pool.timestamp = block.timestamp;

      poolByTimestamp[block.timestamp] = pool;

      lastPoolTimestamp = block.timestamp;

      poolTimestampById[pool.id] = block.timestamp;
    }

    console.log("pool_update");
  }

  function _calculateIndexes(uint256 yieldPeriod, DataTypes.PoolV1 memory lastPool) public view returns (uint256 periodYieldTokenIndex, uint256 periodYieldInFlowRateIndex) {
    //DataTypes.PoolV1 memory lastPool = lastPool;

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
  // #region  ============= =============  Internal Supplier Functions ============= ============= //

  function _getSupplier(address _supplier) internal returns (DataTypes.Supplier storage) {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

    if (supplier.createdTimestamp == 0) {
      supplier.createdTimestamp = block.timestamp;
      supplier.supplier = _supplier;
      supplier.timestamp = block.timestamp;
      supplierId = supplierId + 1;
      supplier.id = supplierId;
      poolByTimestamp[block.timestamp].nrSuppliers++;
      supplierAdressById[supplier.id] = _supplier;
    }

    return supplier;
  }

  function _supplierUpdateCurrentState(address _supplier) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

    if (supplier.timestamp < block.timestamp) {
      uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

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
    _poolUpdate();

    _supplierUpdateCurrentState(_supplier);

    DataTypes.Supplier storage supplier = _getSupplier(_supplier);

    supplier.deposit = supplier.deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;

    poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;
  }

  function _updateSupplierFlow(
    address _supplier,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) internal returns (bytes memory newCtx) {
    newCtx = _ctx;
    _poolUpdate();

    _supplierUpdateCurrentState(_supplier);

    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

    int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;
    int96 newNetFlow = inFlow - outFlow;

    if (currentNetFlow < 0) {
      /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE

      if (newNetFlow >= 0) {
        pool.outFlowRate = pool.outFlowRate + currentNetFlow;

        pool.inFlowRate = pool.inFlowRate + newNetFlow;

        ///// refactor logic
        if (newNetFlow == 0) {
          poolContract.sfDeleteFlow(address(poolContract), _supplier);
        } else {
          newCtx = poolContract.sfDeleteFlowWithCtx(_ctx, address(poolContract), _supplier);
        }

        _cancelTask(supplier.outStream.cancelWithdrawId);
        uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
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
          poolContract.sfDeleteFlow(_supplier, address(poolContract));
        }
        if (supplier.inStream.cancelFlowId != bytes32(0)) {
          cancelTask(supplier.inStream.cancelFlowId);
        }

        _outStreamHasChanged(_supplier, -newNetFlow);
      }
    }

    supplier.inStream.flow = inFlow;
    supplier.outStream.flow = outFlow;
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
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

    if (newMinBalance > prevoiusMinBalance) {
      _withdrawDispatcher(_supplier, address(poolContract), newMinBalance - prevoiusMinBalance);
    }

    pool.outFlowBuffer = pool.outFlowBuffer + newMinBalance;
    pool.deposit = pool.deposit - newMinBalance.mul(PRECISSION);

    supplier.deposit = supplier.deposit - newMinBalance.mul(PRECISSION);

    supplier.outStream.minBalance = newMinBalance;

    supplier.outStream.stepAmount = stepAmount;

    supplier.outStream.stepTime = stepTime;
    supplier.outStream.initTime = block.timestamp;

    supplier.outStream.cancelWithdrawId = _createWithdraStepTask(_supplier, supplier.outStream.stepTime);
  }

  function _outStreamHasChanged(address _supplier, int96 newOutFlow) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

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
      poolContract.sfCreateFlow(_supplier, newOutFlow);
    } else if (supplier.outStream.flow > 0) {
      if (supplier.outStream.cancelFlowId != bytes32(0)) {
        cancelTask(supplier.outStream.cancelFlowId);
      }

      if (userBalance < minBalance) {
        _cancelOutstreamFlow(_supplier, userBalance, minBalance);
      } else if (supplier.outStream.flow != newOutFlow) {
        _cancelTask(supplier.outStream.cancelWithdrawId);

        uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.outFlowBuffer = pool.outFlowBuffer - supplier.outStream.minBalance;
        _createOutStream(_supplier, minBalance, newOutFlow, supplier.outStream.minBalance, stepAmount, stepTime);
        poolContract.sfUpdateFlow(_supplier, newOutFlow);
      }
    }
  }

  function _withdrawDispatcher(
    address _supplier,
    address _receiver,
    uint256 withdrawAmount
  ) internal {
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

    uint256 poolAvailable = 0;
    if (superToken.balanceOf(address(poolContract)) > (pool.outFlowBuffer)) {
      poolAvailable = superToken.balanceOf(address(poolContract)) - (pool.outFlowBuffer);
    }

    if (poolAvailable >= withdrawAmount) {
      console.log("NOT PUSHED");
      if (_supplier == _receiver) {
        poolContract.transferSuperToken(_receiver, withdrawAmount);
      }
    } else {
      console.log("YES PUSHED");
      uint256 balance = poolStrategy.balanceOf();

      uint256 fromStrategy = withdrawAmount - poolAvailable;

      uint256 correction;
      if (fromStrategy > balance) {
        correction = fromStrategy - balance;

        if (balance > 0) {
          poolStrategy.withdraw(balance, _receiver);
          pool.yieldSnapshot = pool.yieldSnapshot - balance;
        }

        if (_supplier == _receiver) {
          poolContract.transferSuperToken(_receiver, correction);
        }
      } else {
        poolStrategy.withdraw(fromStrategy, _receiver);
        pool.yieldSnapshot = pool.yieldSnapshot - fromStrategy;
      }
      console.log("YES PUSHED-2");
    }
  }

  function _cancelOutstreamFlow(
    address _receiver,
    uint256 userBalance,
    uint256 minBalance
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_receiver];
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

    _cancelTask(supplier.outStream.cancelWithdrawId);

    pool.outFlowBuffer = pool.outFlowBuffer - minBalance;
    _withdrawDispatcher(_receiver, _receiver, userBalance);
    pool.deposit = pool.deposit - userBalance;
    pool.outFlowRate = pool.outFlowRate - supplier.outStream.flow;
    supplier.deposit = 0;
    supplier.outStream = DataTypes.OutStream(0, bytes32(0), 0, 0, 0, 0, bytes32(0));
  }

  function _calculateYieldSupplier(address _supplier) public view returns (uint256 yieldSupplier) {
    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

    uint256 lastTimestamp = supplier.timestamp;

    DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];
    DataTypes.PoolV1 memory lastSupplierPool = poolByTimestamp[supplier.timestamp];

    ///// Yield from deposit

    uint256 yieldFromDeposit = (supplier.deposit * (lastPool.yieldTokenIndex - lastSupplierPool.yieldTokenIndex)).div(PRECISSION);

    yieldSupplier = yieldFromDeposit;
    if (supplier.inStream.flow > 0) {
      ///// Yield from flow
      uint256 yieldFromFlow = uint96(supplier.inStream.flow) * (lastPool.yieldInFlowRateIndex - lastSupplierPool.yieldInFlowRateIndex);

      yieldSupplier = yieldSupplier + yieldFromFlow;
    }
  }

  // #endregion
  function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) public view returns (uint256 yieldSupplier) {
    uint256 yieldTilllastPool = _calculateYieldSupplier(_supplier);
    DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];

    uint256 yieldAccruedSincelastPool = 0;
    if (currentYieldSnapshot > lastPool.yieldSnapshot) {
      yieldAccruedSincelastPool = currentYieldSnapshot - lastPool.yieldSnapshot;
    }

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream.flow) * yieldInFlowRateIndex;

    yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow;
  }

  // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //

  function _tokensReceived(address from, uint256 amount) external onlyPool {
    ///// suppler config updated && pool
    _updateSupplierDeposit(from, amount, 0);
  }

  function _redeemDeposit(
    uint256 redeemAmount,
    address _supplier,
    uint256 balance
  ) external onlyPool {
    ///// suppler config updated && pool
    _updateSupplierDeposit(_supplier, 0, redeemAmount);

    //poolStrategy.withdraw(redeemAmount, _supplier);
    _withdrawDispatcher(_supplier, _supplier, redeemAmount);
  }

  function updateStreamRecord(
    bytes memory newCtx,
    int96 inFlowRate,
    address sender
  ) external onlyPool returns (bytes memory updateCtx) {
    updateCtx = _updateSupplierFlow(sender, inFlowRate, 0, newCtx);
  }

  function _redeemFlow(int96 _outFlowRate, address _supplier) external onlyPool {
    //// update state supplier

    uint256 realTimeBalance = sToken.balanceOf(_supplier);

    require(realTimeBalance > 0, "NO_BALANCE");

    bytes memory placeHolder = "0x";

    _updateSupplierFlow(_supplier, 0, _outFlowRate, placeHolder);
  }

  function pushedToStrategy(uint256 amount) external onlyPoolStrategy {
    poolByTimestamp[lastPoolTimestamp].yieldSnapshot += amount;
    poolContract.internalPushToAAVE(amount);
  }

  function _redeemFlowStop(address _supplier) external onlyPool {
    _updateSupplierFlow(_supplier, 0, 0, "0x");
  }

  //// #endregion

  function transferSTokens(
    address _sender,
    address _receiver,
    uint256 amount
  ) external onlySToken {
    _poolUpdate();
    _supplierUpdateCurrentState(_sender);
    DataTypes.Supplier storage sender = _getSupplier(_sender);
    _supplierUpdateCurrentState(_receiver);
    DataTypes.Supplier storage receiver = _getSupplier(_receiver);

    sender.deposit = sender.deposit.sub(amount.mul(PRECISSION));
    receiver.deposit = receiver.deposit.add(amount.mul(PRECISSION));
    bytes memory payload = abi.encode(_sender, amount);
    poolContract.internalEmitEvents(_sender, DataTypes.SupplierEvent.TRANSFER, payload, _sender);
    poolContract.emitEventSupplier(_receiver);
  }

  function withdrawStep(address _receiver) external onlyOps {
    //// check if

    _poolUpdate();
    _supplierUpdateCurrentState(_receiver);

    //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
    uint256 fee;
    address feeToken;

    (fee, feeToken) = IOps(ops).getFeeDetails();

    poolContract.transfer(fee, feeToken);

    DataTypes.Supplier storage supplier = suppliersByAddress[_receiver];
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];
    uint256 userBalance = sToken.balanceOf(_receiver);
    uint256 minBalance = supplier.outStream.minBalance;
    uint256 stepAmount = (uint96(supplier.outStream.flow)) * (supplier.outStream.stepTime);

    ////// user balance goes below min balance, stream will be stopped and all funds will be returned
    if (userBalance < minBalance) {
      _cancelOutstreamFlow(_receiver, userBalance, minBalance);
    } else {
      _withdrawDispatcher(_receiver, address(poolContract), stepAmount);

      pool.deposit = pool.deposit.sub(stepAmount.mul(PRECISSION));

      supplier.deposit = supplier.deposit.sub(stepAmount.mul(PRECISSION));
      supplier.outStream.initTime = block.timestamp;
    }
    bytes memory payload = abi.encode(stepAmount);
    poolContract.internalEmitEvents(_receiver, DataTypes.SupplierEvent.WITHDRAW_STEP, payload, _receiver);
  }

  function cancelTask(bytes32 _taskId) public {
    IOps(ops).cancelTask(_taskId);
  }

  modifier onlyPool() {
    require(msg.sender == address(poolContract), "Only Pool");
    _;
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

  modifier onlyOwner() {
    require(msg.sender == owner, "Only Owner");
    _;
  }


   function _cancelTask (bytes32 taskId) internal {
  IOps(ops).cancelTask(taskId);
 }

  //// Withdrawal step task
  function _createWithdraStepTask(address _supplier, uint256 _stepTime) internal returns (bytes32 taskId) {
    
     
     bytes memory timeArgs = abi.encode(uint128(block.timestamp + _stepTime), _stepTime);

     bytes memory execData = abi.encodeWithSelector(this.withdrawStep.selector, _supplier );

    LibDataTypes.Module[] memory modules = new LibDataTypes.Module[](1);

    modules[0] = LibDataTypes.Module.TIME;


    bytes[] memory args =  new  bytes[](1);

    args[0] =  timeArgs;

    LibDataTypes.ModuleData  memory moduleData =LibDataTypes.ModuleData( modules, args);


    taskId = IOps(ops).createTask(
    address(this),
    execData,
    moduleData,
    ETH
    );


  }
}
