// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import { DataTypes } from "./DataTypes.sol";

/**
 * @title Events
 * @author donoso_eth
 *
 * @notice A standard library of data types used throughout.
 */
library Events {
  event SupplierUpdate(DataTypes.Supplier supplier);

  event SupplierEvent(DataTypes.SupplierEvent supplierEvent, bytes payload, uint256 timestmap, address supplier);

  event PoolUpdate(DataTypes.Pool pool);
}
