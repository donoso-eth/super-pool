//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolV2 } from './IPool-V2.sol'; 


interface ISTokenV2 {

    function initialize(
        string memory _name,
        string memory _symbol,
        address _owner
    ) external;

  function balanceOf(address _supplier) external view returns (uint256 balance);

  function getSupplierBalance(address _supplier) external view returns (uint256 balance);

  function balanceOfShares(address _supplier) external view returns (uint256 _shares);

}
