//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";

import {IPoolFactoryV2 } from './IPoolFactory-V2.sol'; 

interface ISTokenFactoryV2 {

  function initialize(IPoolFactoryV2 _pool, address _ops,string memory _name, string memory _symbol) external;

  function balanceOf(address _supplier) external view returns (uint256 balance);

  function getSupplierBalance(address _supplier) external view returns (uint256 balance);

  function balanceOfShares(address _supplier) external view returns (uint256 _shares);
}
