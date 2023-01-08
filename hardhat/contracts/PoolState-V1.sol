// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { CFAv1Library } from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import { IConstantFlowAgreementV1 } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";

import { IOps } from "./gelato/IOps.sol";
import { IPoolInternalV1 } from "./interfaces/IPoolInternal-V1.sol";
import { IPoolStrategyV1 } from "./interfaces/IPoolStrategy-V1.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import { DataTypes } from "./libraries/DataTypes.sol";
import { Events } from "./libraries/Events.sol";

contract PoolStateV1 {
  bool emergency = false;

  //ERC20

  mapping(address => uint256) public _balances;

  mapping(address => mapping(address => uint256)) public _allowances;

  uint256 public _totalSupply;

  string public _name;
  string public _symbol;

  // #region pool state

  address owner;
  address poolFactory;

  uint256 lastPoolTimestamp;
  uint256 lastExecution;
  //// TOKENS
  ISuperToken superToken;
  IERC20 token;

  //// SUPERFLUID

  //// GELATO
  IOps public ops;
  address payable public gelato;
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  bytes32 public balanceTreasuryTask;

  //// PARAMETERS

  uint256 constant MAX_INT = 2 ** 256 - 1;

  uint256 constant PRECISSION = 1_000_000;

  uint256 constant SUPERFLUID_DEPOSIT = 4 * 3600;
  uint256 constant POOL_BUFFER = 3600; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 constant MIN_OUTFLOW_ALLOWED = 24 * 3600; // 1 hour minimum flow == Buffer

  uint256 constant DEPOSIT_TRIGGER_AMOUNT = 100 ether;
  uint256 constant BALANCE_TRIGGER_TIME = 24 * 3600;

  uint256 constant PROTOCOL_FEE = 3;

  address public poolStrategy;
  address public poolInternal;

  /// POOL STATE

  uint256 poolId;
  uint256 supplierId;

  mapping(address => DataTypes.Supplier) suppliersByAddress;

  mapping(uint256 => DataTypes.Pool) poolByTimestamp;

  CFAv1Library.InitData _cfaLib;
  ISuperfluid host; // host
  IConstantFlowAgreementV1 cfa; // the stored constant flow agreement class address
}
