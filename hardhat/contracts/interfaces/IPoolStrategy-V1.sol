//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolV1} from "./IPool-V1.sol";

interface IPoolStrategyV1 {

  function balanceOf() external view returns(uint256 balance);

  function withdraw(uint256 amount, address _supplier) external;

  function pushToStrategy() external;

}
