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
    uint256 TWAP;
    Stream inStream;
    Stream outStream;
    uint256 depositAmount;
    uint256 createdTimestamp;
    uint256 lastTimestamp;
    uint256 periodId;
  }



  struct Period {
    uint256 timestamp;
    uint256 periodId;
    int96 flow;
    uint256 deposit;
    uint256 startTWAP;
    uint256 periodTWAP;
    uint256 yield;
    uint256 periodSpan;
  }

}
