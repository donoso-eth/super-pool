// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { DataTypes } from "../libraries/DataTypes.sol";
import { IPoolV1 } from "./IPool-V1.sol";
import { ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { IPool } from "../aave/IPool.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPoolStrategyV1 {
  function initialize(ISuperToken _superToken, IERC20 _token, IPoolV1 _pool, IPool _aavePool, IERC20 _aToken) external;

  function balanceOf() external view returns (uint256 balance);

  function withdraw(uint256 amount, address _supplier) external;

  function pushToStrategy(uint256 amountToDeposit) external;
}
