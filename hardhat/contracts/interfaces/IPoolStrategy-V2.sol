//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolV2} from "./IPool-V2.sol";

interface IPoolStrategyV2 {

  //   function initialize(
  //   IOps _ops,
  //   ISuperToken _superToken,
  //   ERC20mintable _token,
  //   IPoolV2 _pool,
  //   IPool _aavePool,
  //   IERC20 _aToken,
  //   IPoolInternalV2 _poolInternal,
  //   ERC20mintable _aaveToken
  // ) external;
  
  function balanceOf() external view returns(uint256 balance);

  function withdraw(uint256 amount, address _supplier) external;


}
