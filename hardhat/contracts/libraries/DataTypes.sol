// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ISTokenV2}  from '../interfaces/ISToken-V2.sol';
import {IPoolStrategyV2} from '../interfaces/IPoolStrategy-V2.sol';
import {IGelatoTasksV2} from '../interfaces/IGelatoTasks-V2.sol'; 
import {IResolverSettingsV2} from '../interfaces/IResolverSettings-V2.sol'; 

/**
 * @title DataTypes
 * @author donoso_eth
 *
 * @notice A standard library of data types used throughout.
 */
library DataTypes {



  struct ResolverSettingsInitilizer {
    address _poolStrategy;
    address _gelatoTaks;
    address _gelatoOps;
    address _poolInternal;
  }


  struct SuperPoolInput {
    address poolFactoryImpl;
    ISTokenV2 sTokenImpl; 
    ISuperToken  superToken;
    IERC20 token;
    IResolverSettingsV2 settings;
    ResolverSettingsInitilizer settingsInitializer;
  }

  struct PoolFactoryInitializer {
    ISuperfluid host;
    ISuperToken superToken;
    IERC20 token;
    IResolverSettingsV2 resolverSettings;
    address owner;
  }


  struct SupertokenResolver {
    address pool;
    address sToken;
  }

  struct Stream {
    int96 flow;
    bytes32 cancelFlowId;

  }


  struct OutStream{
    int96 flow;
    bytes32 cancelFlowId;
    uint256 stepAmount;
    uint256 stepTime;
    uint256 initTime;
    uint256 minBalance;
    bytes32 cancelWithdrawId;
   

  }


  struct Supplier {
    uint256 id;
    address supplier;
    uint256 cumulatedYield;
    uint256 deposit;
    uint256 timestamp;
    uint256 createdTimestamp;
    uint256 eventId;
      Stream inStream;
    OutStream outStream;
    APY apy;

  }



  struct APY {
    uint256 span;
    uint256 apy;
  }

  struct PoolV2 {
    uint256 id;
    uint256 timestamp;
        
    uint256 nrSuppliers; 

    // uint256 totalShares;
    uint256 deposit;
    uint256 depositFromInFlowRate;

    int96 inFlowRate;
    int96 outFlowRate;
   
    uint256 outFlowBuffer;

    uint256 yieldTokenIndex;
    uint256 yieldInFlowRateIndex;

 
    uint256 yieldAccrued;
    uint256 yieldSnapshot;
    uint256 totalYield;
    APY apy;

  }
 
  enum SupplierEvent {
   DEPOSIT, // (uint256)
      WITHDRAW, // (uint256)
      TRANSFER,// (address.uint256)
      STREAM_START, //(int96)
      STREAM_UPDATE, //(int96)
      STREAM_STOP, //
      OUT_STREAM_START, //(int96)
       OUT_STREAM_UPDATE, //(int96)
      OUT_STREAM_STOP, //
      PUSH_TO_STRATEGY, //(uint256)
      WITHDRAW_STEP,//
      REBALANCE //
  }

}
