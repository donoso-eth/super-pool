//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolV2} from "./IPoolFactory-V2.sol";

interface IResolverSettingsV2 {

  function initialize( DataTypes.ResolverSettingsInitilizer memory resolverSettingsInitilizer, address _pool, address _sToken) external ;

  function getPrecission() external view returns (uint256);

  function setPrecission(uint256 _precission) external;

  function getPool() external view returns (address);

  function getPoolInternal() external view returns (address);

  function getSToken() external view returns (address);

  function getPoolStrategy() external view returns (address);

  function getGelatoTasks() external view returns (address);

  function getGelatoOps() external view returns (address);

  function getPoolBuffer() external view returns (uint256);

  function setPoolBuffer(uint256 _poolBuffer) external ;

  function setSuperfluidDeposit(uint256 _superfluidDeposit) external;

  function getSuperfluidDeposit() external view returns (uint256);
  

  function setSteps(uint8 _steps) external;

  function getSteps() external view returns (uint8);
}
