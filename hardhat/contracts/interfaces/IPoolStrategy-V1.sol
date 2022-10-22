//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolV1} from "./IPool-V1.sol";

interface IPoolStrategyV1 {

  //   function initialize(
  //   IOps _ops,
  //   ISuperToken _superToken,
  //   ERC20mintable _token,
  //   IPoolV1 _pool,
  //   IPool _aavePool,
  //   IERC20 _aToken,
  //   IPoolInternalV1 _poolInternal,
  //   ERC20mintable _aaveToken
  // ) external;
  
  function balanceOf() external view returns(uint256 balance);

  function withdraw(uint256 amount, address _supplier) external;


}
