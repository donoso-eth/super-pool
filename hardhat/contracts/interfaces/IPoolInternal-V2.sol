//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";

interface IPoolInternalV2 {

function _poolUpdate(DataTypes.PoolV2 memory lastPool, uint256 periodSpan, uint256 currentYieldSnapshot ) external returns (DataTypes.PoolV2 memory);
   
function _supplierUpdateCurrentState(address _supplier) external  view returns(DataTypes.Supplier memory supplier, DataTypes.PoolV2 memory currentPool);

  function _updateSupplierFlow(
    address _supplier,
    int96 inFlow,
    int96 outFlow,
    bytes memory _ctx
  ) external returns (bytes memory newCtx ,DataTypes.Supplier memory supplier, DataTypes.PoolV2 memory currentPool);


  function withdrawDispatcher (
    DataTypes.Supplier memory supplier, 
    DataTypes.PoolV2 memory currentPool,
    address _receiver,
    uint256 withdrawAmount
  ) external  returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory);

   function cancelFlow(
     DataTypes.Supplier memory receiver, 
    DataTypes.PoolV2 memory currentPool,
    uint256 userBalance,
    uint256 minBalance
  ) external   returns (DataTypes.Supplier  memory,   DataTypes.PoolV2 memory);


function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) external view returns (uint256 yieldSupplier);
}