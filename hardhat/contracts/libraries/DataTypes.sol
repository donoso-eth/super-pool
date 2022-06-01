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
    uint256 initTimestamo
}


  struct User {
      address name;
      uint256 cumulated;


  }
}