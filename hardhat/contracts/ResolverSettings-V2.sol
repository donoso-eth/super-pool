//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolV2} from "./interfaces/IPool-V2.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Helpers} from "./libraries/Helpers.sol";

contract ResolverSettingsV2 is Initializable, OwnableUpgradeable {
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  //// PARAMS
  uint256 public PRECISSION;

  uint8 public STEPS; // proportinal decrease deposit
  uint256 public SUPERFLUID_DEPOSIT;
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public MIN_OUTFLOW_ALLOWED; // 1 hour minimum flow == Buffer

  uint256 public DEPOSIT_TRIGGER_AMOUNT;
  uint256 public DEPOSIT_TRIGGER_TIME;

  //// CONTRACTS
  address pool;
  address sToken;
  address poolStrategy;
  address gelatoTaks;
  address gelatoOps;
  address poolInternal;

  constructor() {}

  function initialize(
    DataTypes.ResolverSettingsInitilizer memory resolverSettingsInitilizer,
    address _pool,
    address _sToken
  ) external initializer {
    __Ownable_init_unchained();

    pool = _pool;
    sToken = _sToken;
    poolStrategy = resolverSettingsInitilizer._poolStrategy;
    gelatoTaks = resolverSettingsInitilizer._gelatoTaks;
    gelatoOps = resolverSettingsInitilizer._gelatoOps;
    poolInternal = resolverSettingsInitilizer._poolInternal;

    PRECISSION = 1_000_000;
    MIN_OUTFLOW_ALLOWED = 3600; // 1 hour minimum flow == Buffer

    STEPS = 10;
    POOL_BUFFER = 3600; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
    SUPERFLUID_DEPOSIT = 4 * 3600;

    DEPOSIT_TRIGGER_AMOUNT = 0;
    DEPOSIT_TRIGGER_TIME = 3600;
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

  function getPoolBuffer() external view returns (uint256) {
    return POOL_BUFFER;
  }

  function setPoolBuffer(uint256 _poolBuffer) external onlyOwner {
    POOL_BUFFER = _poolBuffer;
  }

  function setSuperfluidDeposit(uint256 _superfluidDeposit) external onlyOwner {
    SUPERFLUID_DEPOSIT = _superfluidDeposit;
  }

  function getSuperfluidDeposit() external view returns (uint256) {
    return SUPERFLUID_DEPOSIT;
  }

  function setSteps(uint8 _steps) external onlyOwner {
    require(_steps <= 20, 'MAX_20_STEPS');
    STEPS = _steps;
  }

  function getSteps() external view returns (uint8) {
    return STEPS;
  }



}
