// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import {DataTypes} from "./DataTypes.sol";

/**
 * @title Events
 * @author donoso_eth
 *
 * @notice A standard library of data types used throughout.
 */
library Events {

      event SupplyDepositStarted(address supplier, uint256 amount);

      event SupplyStreamStarted(address supplier, int96 flowRate);

}