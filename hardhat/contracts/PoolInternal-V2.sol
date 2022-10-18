//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISTokenV2} from "./interfaces/ISToken-V2.sol";
import {IResolverSettingsV2} from "./interfaces/IResolverSettings-V2.sol";

import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";
import {IPoolV2} from "./interfaces/IPool-V2.sol";
import {DataTypes} from "./libraries/DataTypes.sol";
import {IGelatoTasksV2} from "./interfaces/IGelatoTasks-V2.sol";
import {ISuperToken, ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";


contract PoolInternalV2 is Initializable {
  using SafeMath for uint256;

  uint256 poolId;
  ISTokenV2 sToken;
  IPoolV2 pool;
  IPoolStrategyV2 poolStrategy;
  IGelatoTasksV2 gelatoTasks;

  ISuperToken superToken;
 ISuperfluid public host; // host
  IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address

    using CFAv1Library for CFAv1Library.InitData;
  CFAv1Library.InitData internal _cfaLib;

  uint256 public PRECISSION;
    uint8 public STEPS; // proportinal decrease deposit
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public SUPERFLUID_DEPOSIT;
  uint56 public MIN_OUTFLOW_ALLOWED;

  /**
   * @notice initializer of the Pool
   */
  function initialize(IResolverSettingsV2 resolverSettings, ISuperToken _superToken, ISuperfluid _host) external initializer {
    ///initialState

    pool = IPoolV2(resolverSettings.getPool());
    sToken = ISTokenV2(resolverSettings.getSToken());
    gelatoTasks = IGelatoTasksV2(resolverSettings.getGelatoTasks());
    superToken = _superToken;
    host = _host;
    PRECISSION = resolverSettings.getPrecission();
    STEPS = resolverSettings.getSteps();
    SUPERFLUID_DEPOSIT = resolverSettings.getSuperfluidDeposit();
    POOL_BUFFER = resolverSettings.getPoolBuffer();
    MIN_OUTFLOW_ALLOWED = 3600;

    cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
    _cfaLib = CFAv1Library.InitData(host, cfa);

  }

  function _poolUpdate(
    DataTypes.PoolV2 memory lastPool,
    uint256 periodSpan,
    uint256 currentYieldSnapshot
  ) public returns (DataTypes.PoolV2 memory) {
    poolId++;

    DataTypes.PoolV2 memory currentPool = DataTypes.PoolV2(poolId, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

    currentPool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;

    currentPool.deposit = lastPool.deposit;

    currentPool.yieldSnapshot = currentYieldSnapshot;

    currentPool.yieldAccrued = currentPool.yieldSnapshot - lastPool.yieldSnapshot;

    currentPool.totalYield = lastPool.totalYield + currentPool.yieldAccrued;

    currentPool.apy.span = lastPool.apy.span + periodSpan;
    uint256 periodApy;

    periodApy = lastPool.deposit == 0 ? 0 : currentPool.yieldAccrued.mul(365 * 24 * 3600 * 100).div(periodSpan).div(lastPool.deposit);

    currentPool.apy.apy = ((periodSpan.mul(periodApy)).add(lastPool.apy.span.mul(lastPool.apy.apy))).div(currentPool.apy.span);

    (currentPool.yieldTokenIndex, currentPool.yieldInFlowRateIndex) = _calculateIndexes(currentPool.yieldAccrued, lastPool);

    currentPool.yieldTokenIndex = currentPool.yieldTokenIndex + lastPool.yieldTokenIndex;
    currentPool.yieldInFlowRateIndex = currentPool.yieldInFlowRateIndex + lastPool.yieldInFlowRateIndex;

    currentPool.inFlowRate = lastPool.inFlowRate;
    currentPool.outFlowRate = lastPool.outFlowRate;
    currentPool.outFlowBuffer = lastPool.outFlowBuffer;

    currentPool.timestamp = block.timestamp;

    return currentPool;
  }

  function _calculateIndexes(uint256 yieldPeriod, DataTypes.PoolV2 memory lastPool) public view returns (uint256 periodYieldTokenIndex, uint256 periodYieldInFlowRateIndex) {
    //DataTypes.PoolV2 memory lastPool = lastPool;

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

  function _supplierUpdateCurrentState(address _supplier) external returns (DataTypes.Supplier memory supplier, DataTypes.PoolV2 memory currentPool) {
    supplier = pool.getSupplierByAdress(_supplier);
    currentPool = pool.getPool(block.timestamp);

    if (supplier.timestamp < block.timestamp) {
      uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

      if (supplier.inStream.flow > 0) {
        uint256 inflow = uint96(supplier.inStream.flow) * (block.timestamp - supplier.timestamp);

        currentPool.depositFromInFlowRate = currentPool.depositFromInFlowRate - inflow * PRECISSION;
        currentPool.deposit = inflow * PRECISSION + currentPool.deposit;
        supplier.deposit = supplier.deposit + inflow * PRECISSION;
      }

      if (supplier.outStream.flow > 0) {
        // pool.deposit = yieldSupplier + pool.deposit;
        // supplier.deposit = supplier.deposit + yieldSupplier;
      }

      currentPool.deposit = yieldSupplier + currentPool.deposit;
      supplier.deposit = supplier.deposit + yieldSupplier;
      supplier.timestamp = block.timestamp;
      pool.internalUpdates(supplier, currentPool);
    }
  }

  function _calculateYieldSupplier(address _supplier) public view returns (uint256 yieldSupplier) {
    DataTypes.Supplier memory supplier = pool.getSupplierByAdress(_supplier);

    uint256 lastTimestamp = supplier.timestamp;

    DataTypes.PoolV2 memory lastPool = pool.getLastPool();
    DataTypes.PoolV2 memory lastSupplierPool = pool.getPool(supplier.timestamp);

    ///// Yield from deposit

    uint256 yieldFromDeposit = (supplier.deposit * (lastPool.yieldTokenIndex - lastSupplierPool.yieldTokenIndex)).div(PRECISSION);

    yieldSupplier = yieldFromDeposit;
    if (supplier.inStream.flow > 0) {
      ///// Yield from flow
      uint256 yieldFromFlow = uint96(supplier.inStream.flow) * (lastPool.yieldInFlowRateIndex - lastSupplierPool.yieldInFlowRateIndex);

      yieldSupplier = yieldSupplier + yieldFromFlow;
    }
  }

  function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) public view returns (uint256 yieldSupplier) {
    uint256 yieldTilllastPool = _calculateYieldSupplier(_supplier);
    DataTypes.PoolV2 memory lastPool = pool.getLastPool();

    uint256 yieldAccruedSincelastPool = 0;
    if (currentYieldSnapshot > lastPool.yieldSnapshot) {
      yieldAccruedSincelastPool = currentYieldSnapshot - lastPool.yieldSnapshot;
    }

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

    DataTypes.Supplier memory supplier = pool.getSupplierByAdress(_supplier);

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream.flow) * yieldInFlowRateIndex;

    yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow;
  }

  ////// FLOW
  function _updateSupplierFlow(
    address _supplier,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) external returns (bytes memory newCtx ,DataTypes.Supplier memory supplier, DataTypes.PoolV2 memory currentPool) {
 
     currentPool = pool.getPool(block.timestamp);
    newCtx = _ctx;


    int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;
    int96 newNetFlow = inFlow - outFlow;

    if (currentNetFlow < 0) {
      /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE

      if (newNetFlow >= 0) {
        currentPool.outFlowRate = currentPool.outFlowRate + currentNetFlow;

        currentPool.inFlowRate = currentPool.inFlowRate + newNetFlow;

        ///// refactor logic
        if (newNetFlow == 0) {
          _cfaLib.deleteFlowByOperator(address(pool), _supplier, superToken);
        } else {
          newCtx = _cfaLib.deleteFlowByOperatorWithCtx(_ctx, address(pool), _supplier, superToken);
        }

        gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);
        uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        currentPool.deposit = currentPool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        currentPool.outFlowBuffer = currentPool.outFlowBuffer - supplier.outStream.minBalance;
        supplier.outStream = DataTypes.OutStream(0, bytes32(0), 0, 0, 0, 0, bytes32(0));
      } else {
        currentPool.outFlowRate = currentPool.outFlowRate + currentNetFlow - newNetFlow;

        //   pool.deposit = pool.deposit - supplier.deposit;

        //// creatre timed task
      (supplier,currentPool) =  _outStreamHasChanged(supplier,currentPool, -newNetFlow);
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

      if (newNetFlow >= 0) {
        currentPool.inFlowRate = currentPool.inFlowRate - currentNetFlow + inFlow;
      } else {
        /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

        currentPool.outFlowRate += -newNetFlow;
        currentPool.inFlowRate -= currentNetFlow;

      
        if (currentNetFlow > 0) {
          _cfaLib.deleteFlowByOperator(_supplier, address(pool), superToken);
        }
        if (supplier.inStream.cancelFlowId != bytes32(0)) {
          pool.cancelTask(supplier.inStream.cancelFlowId);
        }

       (supplier,currentPool) =  _outStreamHasChanged(supplier, currentPool,-newNetFlow);
      }
    }

    supplier.inStream.flow = inFlow;
    supplier.outStream.flow = outFlow;

    pool.internalUpdates(supplier, currentPool);

  }

  function _outStreamHasChanged(DataTypes.Supplier memory supplier, DataTypes.PoolV2 memory currentPool, int96 newOutFlow) internal returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory) {

    uint256 userBalance = sToken.balanceOf(supplier.supplier);
    uint256 stepTime = userBalance.div(uint256(STEPS)).div(uint96(newOutFlow));
    uint256 stepAmount = (uint96(newOutFlow)) * (stepTime);
    uint256 minBalance = stepAmount.add((POOL_BUFFER.add(SUPERFLUID_DEPOSIT)).mul(uint96(newOutFlow)));

    if (supplier.outStream.flow == 0) {
      if (userBalance < minBalance) {
        revert("No sufficent funds");
      }

      // poolStrategy.withdraw(minBalance, address(this));
     (supplier, currentPool) =   _createOutStream(supplier,currentPool, minBalance, newOutFlow, 0, stepAmount, stepTime);

    _cfaLib.createFlowByOperator(address(pool), supplier.supplier, superToken, newOutFlow);

   
    } else if (supplier.outStream.flow > 0) {
      if (supplier.outStream.cancelFlowId != bytes32(0)) {
        pool.cancelTask(supplier.outStream.cancelFlowId);
      }

      if (userBalance < minBalance) {
      (supplier, currentPool) =  _cancelFlow(supplier, currentPool, userBalance, minBalance);
      } else if (supplier.outStream.flow != newOutFlow) {
        gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);

        uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        currentPool.deposit = currentPool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        currentPool.outFlowBuffer = currentPool.outFlowBuffer - supplier.outStream.minBalance;
        (supplier, currentPool) = _createOutStream(supplier, currentPool, minBalance, newOutFlow, supplier.outStream.minBalance, stepAmount, stepTime);
        _cfaLib.updateFlowByOperator(address(pool),supplier.supplier, superToken, newOutFlow);

      

      }
    }
    return (supplier,currentPool);
  }


  
  function _createOutStream(
   DataTypes.Supplier memory supplier, 
   DataTypes.PoolV2 memory currentPool,
    uint256 newMinBalance,
    int96 newOutFlow,
    uint256 prevoiusMinBalance,
    uint256 stepAmount,
    uint256 stepTime
  ) internal returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory)  {


    if (newMinBalance > prevoiusMinBalance) {
    (supplier, currentPool) =  _withdrawDispatcher(supplier,currentPool, address(pool), newMinBalance - prevoiusMinBalance);
    }

    currentPool.outFlowBuffer = currentPool.outFlowBuffer + newMinBalance;
    currentPool.deposit = currentPool.deposit - newMinBalance.mul(PRECISSION);

    supplier.deposit = supplier.deposit - newMinBalance.mul(PRECISSION);

    supplier.outStream.minBalance = newMinBalance;
    supplier.outStream.stepAmount = stepAmount;
    supplier.outStream.stepTime = stepTime;
    supplier.outStream.initTime = block.timestamp;

    supplier.outStream.cancelWithdrawId = gelatoTasks.createWithdraStepTask(supplier.supplier, supplier.outStream.stepTime);
      return (supplier,currentPool);
  }

  function withdrawDispatcher (
    DataTypes.Supplier memory supplier, 
    DataTypes.PoolV2 memory currentPool,
    address _receiver,
    uint256 withdrawAmount
  ) external onlyPool returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory)  {
     (supplier, currentPool) = _withdrawDispatcher(supplier, currentPool, _receiver, withdrawAmount);
       return (supplier,currentPool);
  }

  function _withdrawDispatcher (
    DataTypes.Supplier memory supplier, 
    DataTypes.PoolV2 memory currentPool,
    address _receiver,
    uint256 withdrawAmount
  ) internal  returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory)  {
 

    uint256 poolAvailable = 0;
    if (superToken.balanceOf(address(pool)) > (currentPool.outFlowBuffer)) {
      poolAvailable = superToken.balanceOf(address(pool)) - (currentPool.outFlowBuffer);
    }

    if (poolAvailable >= withdrawAmount) {
      if (supplier.supplier == _receiver) {
        IERC20(address(superToken)).transfer(_receiver, withdrawAmount);
      }
    } else {
      uint256 balance = poolStrategy.balanceOf();
      uint256 fromStrategy = withdrawAmount - poolAvailable;
      uint256 correction;
      if (fromStrategy > balance) {
        correction = fromStrategy - balance;
        poolStrategy.withdraw(balance, _receiver);
        currentPool.yieldSnapshot = currentPool.yieldSnapshot - balance;
        if (supplier.supplier == _receiver) {
          IERC20(address(superToken)).transfer(_receiver, correction);
        }
      } else {
        poolStrategy.withdraw(fromStrategy, _receiver);
        currentPool.yieldSnapshot = currentPool.yieldSnapshot - fromStrategy;
        // if (_supplier == _receiver) {
        //   IERC20(address(superToken)).transfer(_receiver, poolAvailable);
        // }
      }
    }
       return (supplier,currentPool);
  }

  function cancelFlow(
     DataTypes.Supplier memory receiver, 
    DataTypes.PoolV2 memory currentPool,
    uint256 userBalance,
    uint256 minBalance
  ) external onlyPool  returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory){
    (receiver, currentPool) = _cancelFlow(receiver, currentPool, userBalance, minBalance);
     return (receiver,currentPool);
  }

  function _cancelFlow(
     DataTypes.Supplier memory receiver, 
    DataTypes.PoolV2 memory currentPool,
    uint256 userBalance,
    uint256 minBalance
  ) internal returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory)  {


    gelatoTasks.cancelTask(receiver.outStream.cancelWithdrawId);

    currentPool.outFlowBuffer = currentPool.outFlowBuffer - minBalance;
   (receiver, currentPool) = _withdrawDispatcher(receiver, currentPool, receiver.supplier, userBalance);
    currentPool.deposit = currentPool.deposit - userBalance;
    currentPool.outFlowRate = currentPool.outFlowRate - receiver.outStream.flow;
    receiver.deposit = 0;
    receiver.outStream = DataTypes.OutStream(0, bytes32(0), 0, 0, 0, 0, bytes32(0));
    return (receiver,currentPool);
  }

    modifier onlyPool() {
    require(msg.sender == address(pool), "Only Pool Allowed");
    _;
  }



}
