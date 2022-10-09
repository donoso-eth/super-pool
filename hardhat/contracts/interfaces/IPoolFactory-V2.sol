//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";

interface IPoolFactoryV2 {
  /**
   * @notice initializer of the contract/oracle
   */
  function initialize(DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer) external;

  function stopstream(
    address _receiver,
    bool _all,
    uint8 _flowType
  ) external;

  function poolUpdateCurrentState() external;

  function updateSupplierDeposit(
    address _supplier,
    uint256 inDeposit,
    uint256 outDeposit,
    uint256 outAssets
  ) external;

  function supplierUpdateCurrentState(address _supplier) external;

  function getSupplierByAdress(address _supplier) external view returns (DataTypes.Supplier memory supplier);

  function getLastPool() external view returns (DataTypes.PoolV2 memory);

  function transfer(uint256 _amount, address _paymentToken) external;

  function withdrawStep(address _receiver) external;

  function totalYieldEarnedSupplier(address _supplier) external view returns (uint256 yieldSupplier);

  function pushedToStrategy(uint256 amount ) external;

}
