//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";


interface IPoolFactory  {


  /**
   * @notice initializer of the contract/oracle
   */
  function initialize(
    DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer
  ) external ;
}