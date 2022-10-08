//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolFactoryV2} from "./IPoolFactory-V2.sol";

interface ISettingsV2 {
  function getPrecission() external view returns (uint256);

  function setPrecission(uint256 _precission) external;
}
