// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

/**
 * @title DataTypes
 * @author donoso_eth
 *
 * @notice A standard library of data types used throughout.
 */
library DataTypes {
  struct SuperPoolInput {
    address poolFactory;
    // address poolTokenFactory;
    address superToken;
    // address customTokenFactory;
    // string name;
    // string symbol;
    address ops;
  }

  struct PoolFactoryInitializer {
    ISuperfluid host;
    ISuperToken superToken;
    address ops;
  }

  struct Stream {
    int96 flow;
    bytes32 cancelTaskId;

  }

  struct Deposit {
    uint256 amount;
  
  }

  struct Supplier {
    address supplier;
    uint256 supplierId;
    uint256 cumulatedYield;
    Stream inStream;
    Stream outStream;
    Deposit deposit;
    uint256 timestamp;
    uint256 createdTimestamp;
    uint256 eventId;

  }

  struct Period {
    uint256 timestamp;
    uint256 deposit;
    int96 inFlowRate;
    int96 outFlowRate;
    uint256 depositFromInFlowRate;
    uint256 depositFromOutFlowRate;
    uint256 yieldTokenIndex;
    uint256 yieldInFlowRateIndex;
    uint256 yieldOutFlowRateIndex;
    uint256 yieldAccruedSec;
  }
}
