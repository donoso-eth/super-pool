//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Helpers} from "./libraries/Helpers.sol";

contract ResolverSettingsV2 is Initializable, OwnableUpgradeable {
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  //// PARAMS
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public PRECISSION = 1_000_000;
  uint256 public MIN_OUTFLOW_ALLOWED = 3600; // 1 hour minimum flow == Buffer
  uint8 public PARTIAL_DEPOSIT; // proportinal decrease deposit
  uint256 public DEPOSIT_TRIGGER_AMOUNT = 0;
  uint256 public DEPOSIT_TRIGGER_TIME = 3600;

  //// CONTRACTS
  address pool;
  address sToken;
  address poolStrategy;
  address gelatoTaks;
  address gelatoOps;
  address poolInternal;

  constructor() {}

  function initialize( DataTypes.ResolverSettingsInitilizer memory resolverSettingsInitilizer, address _pool, address _sToken) external initializer {
    __Ownable_init_unchained();

    pool = _pool;
    sToken = _sToken;
    poolStrategy = resolverSettingsInitilizer._poolStrategy;
    gelatoTaks = resolverSettingsInitilizer._gelatoTaks;
    gelatoOps = resolverSettingsInitilizer._gelatoOps;
    poolInternal =resolverSettingsInitilizer. _poolInternal;
  }

  // ============= =============  VIEW CONTRACTS ============= ============= //
  // #region VIEW CONTRACTS
  function getPool() external view returns (address) {
    return pool;
  }

  function getPoolInternal() external view returns (address) {
    return poolInternal;
  }

  function getSToken() external view returns (address) {
    return sToken;
  }

  function getPoolStrategy() external view returns (address) {
    return poolStrategy;
  }

  function getGelatoTasks() external view returns (address) {
    return gelatoTaks;
  }

  function getGelatoOps() external view returns (address) {
    return gelatoOps;
  }

  // #endregion

  // ============= =============  PARAMETERS ONLY OWNER  ============= ============= //
  // #region ONLY OWNER

  function getPrecission() external view returns (uint256) {
    return PRECISSION;
  }

  function setPrecission(uint256 _precission) external onlyOwner {
    PRECISSION = _precission;
  }
}
