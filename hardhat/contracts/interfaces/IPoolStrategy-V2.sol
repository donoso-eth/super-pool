//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolV2} from "./IPoolFactory-V2.sol";

interface IPoolStrategyV2 {

  function balanceOf() external view returns(uint256 balance);

  function withdraw(uint256 amount, address _supplier) external;


}
