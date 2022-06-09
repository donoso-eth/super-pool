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
  }

  struct PoolFactoryInitializer {
    ISuperfluid host;
    ISuperToken superToken;
  }


  struct Stream { 
    int96 flow;
    uint256 initTimestamp;
 
  }

  struct Deposit {
    uint256 amount;
    uint256 timestamp;
  }

  struct Supplier {
    address supplier;
    uint256 supplierId;
    uint256 cumulatedReward;
    Stream stream;
    Deposit deposit;
    uint256 createdTimestamp;
    uint256 periodId;
  }

  struct Global {
      uint256 currnetPeriod;
      uint256 totlaDeposit;
      int96 totalFlow;
  }


  struct Period {
    uint256 timestamp;
    uint256 periodId;
    int96 flow;
    uint256 deposit;
    uint256 startTWAP;
    uint256 periodTWAP;
    uint256 rewards;
    uint256 periodSpan;
  }

}
