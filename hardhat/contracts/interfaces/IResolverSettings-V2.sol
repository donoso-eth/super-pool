//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolFactoryV2} from "./IPoolFactory-V2.sol";

interface IResolverSettingsV2 {
  function getPrecission() external view returns (uint256);

  function setPrecission(uint256 _precission) external;

  function getPool() external view returns (address);

  function getPoolInternal() external view returns (address);

  function getSToken() external view returns (address);

  function getPoolStrategy() external view returns (address);

  function getGelatoTasks() external view returns (address);

  function getGelatoOps() external view returns (address);
}
