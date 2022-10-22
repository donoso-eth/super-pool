//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {ISuperfluid, ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {IPoolV2} from "./interfaces/IPool-V2.sol";


interface IPoolInternalV2 {
  function initialize(
    address _owner,
    ISuperToken _superToken,
    IPoolV2 _pool,
    ISTokenV2 _sToken,
    IPoolStrategyV2,
    _poolStrategy,
    IOps ops
  ) external;

  function _redeemDeposit(
    uint256 redeemAmount,
    address _supplier,
    uint256 balance
  ) external;

  function _tokensReceived(address from, uint256 amount) external;

  function _redeemFlow(int96 _outFlowRate, address _supplier) external;

  function updateStreamRecord(
    bytes memory newCtx,
    int96 inFlowRate,
    address sender
  ) external returns (bytes memory updatedCtx);

  function _redeemFlowStop(address _supplier) external;

  function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) external view returns (uint256 yieldSupplier);

  function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier);

  function getPool(uint256 timestamp) external view returns (DataTypes.PoolV2 memory);

  function getLastPool() external view returns (DataTypes.PoolV2 memory);

  function getLastTimestmap() external view returns (uint256);

  function withdrawStep(address _receiver) external;

  function pushedToStrategy(uint256 amount) external;

  function transferSTokens(
    address _sender,
    address _receiver,
    uint256 amount
  ) external;
}
