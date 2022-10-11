//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";

interface IPoolInternalV2 {

function _poolUpdate(DataTypes.PoolV2 memory lastPool, uint256 periodSpan, uint256 currentYieldSnapshot ) external returns (DataTypes.PoolV2 memory);
   


function _calculateIndexes(uint256 yieldPeriod,   DataTypes.PoolV2 memory lastPool ) external view returns (uint256 periodYieldTokenIndex, uint256 periodYieldInFlowRateIndex);

function _calculateYieldSupplier(address _supplier) external view returns (uint256 yieldSupplier);

function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) external view returns (uint256 yieldSupplier);
}