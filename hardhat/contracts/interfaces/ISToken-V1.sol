//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolV1 } from './IPool-V1.sol'; 


interface ISTokenV1 {

function initialize(DataTypes.STokenInitializer memory) external;

  function balanceOf(address _supplier) external view returns (uint256 balance);

  function getSupplierBalance(address _supplier) external view returns (uint256 balance);

  function balanceOfShares(address _supplier) external view returns (uint256 _shares);

}
