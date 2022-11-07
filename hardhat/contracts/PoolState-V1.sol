//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IOps} from "./gelato/IOps.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";


contract PoolStateV1 {

    
    uint256 public lastPoolTimestamp;
    uint256 public lastExecution;

    // #region pool state

    address public owner;
    address public poolFactory;

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

    uint256 MAX_INT;

    uint256 public PRECISSION;

    uint256 public SUPERFLUID_DEPOSIT;
    uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
    uint256 public MIN_OUTFLOW_ALLOWED; // 1 hour minimum flow == Buffer

    uint256 public DEPOSIT_TRIGGER_AMOUNT;
    uint256 public BALANCE_TRIGGER_TIME;

    uint256 public PROTOCOL_FEE;

    address public poolStrategy;
    address  public poolInternal;



    /// POOL STATE

    uint256 public poolId;
    uint256 public supplierId;

    mapping(address => DataTypes.Supplier) public suppliersByAddress;

    mapping(uint256 => DataTypes.PoolV1) public poolByTimestamp;






}