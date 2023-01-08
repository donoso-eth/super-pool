// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { DataTypes } from "../libraries/DataTypes.sol";

interface ISuperPoolFactory {
  // ====================== Called only once by deployment ===========================
  /**
   * @notice initializer when deployment the contract
   */
  function initialize(DataTypes.SuperPoolFactoryInitializer memory factoryInitializer) external;

  // #region ===================== Supplier interaction Pool Events  ===========================

  function createSuperPool(DataTypes.CreatePoolInput memory poolInput) external;

  function getRecordBySuperTokenAddress(address _superToken, address _poolStrategy) external returns (DataTypes.PoolInfo memory poolInfo);
}
