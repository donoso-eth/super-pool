//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";


interface IAllocationMock {

  function getState() external;

  function calculateStatus() external returns(uint256);


  function deposit(uint256 amount) external;

  function withdraw(uint256 amount) external;
}