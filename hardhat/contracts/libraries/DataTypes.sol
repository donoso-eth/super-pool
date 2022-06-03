// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

/**
 * @title DataTypes
 * @author donoso_eth
 *
 * @notice A standard library of data types used throughout.
 */
library DataTypes {
  struct Stream { 
    int96 flow;
    uint256 initTimestamp;
 
  }

  struct Deposit {
    uint256 stakedAmount;
    uint256 stakedTimestamp;
  }

  struct Supplier {
    address supplier;
    uint256 cumulated;
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
    uint256 startTwap;
  }

}
