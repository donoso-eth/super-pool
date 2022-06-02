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

  struct Staker {
    address name;
    uint256 cumulated;
    Stream stream;
    Deposit deposit;
    uint256 createdTimestamp;
  }

  struct Global {
      uint256 currnetPeriod;
      uint256 totlaDeposit;
      int96 totalFlow;
  }
}
