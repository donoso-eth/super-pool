//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";


interface IPoolStrategyV2  {


  function withdraw(uint256 amount) external;

  function deposit(uint256 amount) external;



}