//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";


import {IResolverSettingsV2} from "./interfaces/IResolverSettings-V2.sol";
import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {DataTypes} from "./libraries/DataTypes.sol";

contract PoolInternalV2 is Initializable {
  using SafeMath for uint256;

  uint256 poolId;
  IPoolFactoryV2 pool;

  uint256 public PRECISSION;

  /**
   * @notice initializer of the Pool
   */
  function initialize(IResolverSettingsV2 resolverSettings) external initializer {
    ///initialState

    pool = IPoolFactoryV2(resolverSettings.getPool());
    PRECISSION = resolverSettings.getPrecission();
  }

  function _poolUpdate(
    DataTypes.PoolV2 memory lastPool,
    uint256 periodSpan,
    uint256 currentYieldSnapshot
  ) public returns (DataTypes.PoolV2 memory) {
    
    poolId++;

    DataTypes.PoolV2 memory currentPool = DataTypes.PoolV2(poolId, block.timestamp, 0, 0, 0, 0, 0,0, 0, 0, 0, 0, DataTypes.APY(0, 0));

    currentPool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;

    currentPool.deposit = lastPool.deposit;

    currentPool.yieldSnapshot = currentYieldSnapshot;

    currentPool.yieldAccrued = currentPool.yieldSnapshot - lastPool.yieldSnapshot;

    currentPool.totalYield = lastPool.totalYield +currentPool.yieldAccrued;

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
    if (currentYieldSnapshot>lastPool.yieldSnapshot) {
      yieldAccruedSincelastPool = currentYieldSnapshot -lastPool.yieldSnapshot;
    }

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

    DataTypes.Supplier memory supplier = pool.getSupplierByAdress(_supplier);

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream.flow) * yieldInFlowRateIndex;

    yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow;
  }
}
