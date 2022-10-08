//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {Helpers } from './libraries/Helpers.sol';


contract SettingsV2 is Initializable, OwnableUpgradeable {
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public PRECISSION = 1_000_000;
  uint256 public MIN_OUTFLOW_ALLOWED = 3600; // 1 hour minimum flow == Buffer
  uint8 public PARTIAL_DEPOSIT; // proportinal decrease deposit
  uint256 public DEPOSIT_TRIGGER_AMOUNT = 0;
  uint256 public DEPOSIT_TRIGGER_TIME = 3600;


  constructor() {}

  function initialize() external initializer {
    __Ownable_init_unchained();
  }
    

  // ============= =============  PARAMETERS ONLY OWNER  ============= ============= //
  // #region ONLY OWNER


  function getPrecission() external view returns (uint256) {
    return PRECISSION;
  }

  function setPrecission(uint256 _precission) external onlyOwner {
    
    PRECISSION = _precission;
  }

  // function setMaxAllowance(uint256 _MAX_ALLOWANCE) external onlyOwner {
  //     require(
  //         _MAX_ALLOWANCE > 0 && _MAX_ALLOWANCE < 100,
  //         "MAX_ALLOWANCE_MUS_BE_BETWEEN_0_100"atoken
  //     );
  //     MAX_ALLOWANCE = _MAX_ALLOWANCE;
  // }

  // function setVotingPeriod(uint256 _CREDIT_PHASES_INTERVAL)
  //     external
  //     onlyOwner
  // {
  //     require(
  //         _CREDIT_PHASES_INTERVAL > 600,
  //         "CREDIT_PHASES_INTERVALE_GREATER_THAN_10_MINUTS"
  //     );
  //     CREDIT_PHASES_INTERVAL = _CREDIT_PHASES_INTERVAL;
  // }

  // #endregion


}
