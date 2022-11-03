// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPoolStrategyV1} from "../interfaces/IPoolStrategy-V1.sol";
import {IOps} from "../gelato/IOps.sol";
import {IPoolInternalV1} from "../interfaces/IPoolInternal-V1.sol";
import {IPoolV1} from "../interfaces/IPool-V1.sol";

/**
 * @title DataTypes
 * @author donoso_eth
 *
 * @notice A standard library of data types used throughout.
 */
library DataTypes {
    struct SuperPoolFactoryInitializer {
        ISuperfluid host;
        address poolImpl;
        address poolInternalImpl;
        IOps ops;
    }

    struct CreatePoolInput {
        address superToken;
        address poolStrategy;
    }

    struct PoolInitializer {
        uint256 id;
        string name;
        string symbol;
        ISuperfluid host;
        ISuperToken superToken;
        IERC20 token;
        IPoolInternalV1 poolInternal;
        IPoolStrategyV1 poolStrategy;
        IOps ops;
        address owner;
    }



    struct PoolInternalInitializer {
        ISuperToken superToken;
        IPoolV1 pool;
        IPoolStrategyV1 poolStrategy;
        IOps ops;
        address owner;
    }


    struct PoolInfo {
        uint256 id;
        uint256 idPerSupertoken;
        address superToken;
        address strategy;
        address pool;
        address poolInternal;

    }

 
    struct PoolRecord {
      address pool;
      address poolInternal;
    }



    ///// Supplier

    struct Stream {
        int96 flow;
    }

    struct OutStream {
        int96 flow;
        uint256 streamDuration;
        uint256 streamInit;
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
        int96  inStream;
        OutStream outStream;
        APY apy;
    }

    struct APY {
        uint256 span;
        uint256 apy;
    }



    struct Yield {
        uint256 yieldTokenIndex;
        uint256 yieldInFlowRateIndex;
        uint256 yieldOutFlowRateIndex;
        uint256 yieldAccrued;
        uint256 yieldSnapshot;
        uint256 totalYield;
        uint256 protocolYield;
    }

    /// Pool

    struct PoolV1 {
        uint256 id;
        uint256 timestamp;
        uint256 nrSuppliers;
        // uint256 totalShares;
        uint256 deposit;
        uint256 depositFromInFlowRate;
        uint256 depositFromOutFlowRate;
        int96 inFlowRate;
        int96 outFlowRate;
        uint256 outFlowBuffer;
        Yield yieldObject;
        APY apy;
    }

    enum SupplierEvent {
        DEPOSIT, // (uint256)
        WITHDRAW, // (uint256)
        TRANSFER, // (address.uint256)
        STREAM_START, //(int96)
        STREAM_UPDATE, //(int96)
        STREAM_STOP, //
        OUT_STREAM_START, //(int96)
        OUT_STREAM_UPDATE, //(int96)
        OUT_STREAM_STOP, //
        PUSH_TO_STRATEGY, //(uint256)
        WITHDRAW_STEP, //
        REBALANCE //
    }
}
