//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolFactoryV2 } from './IPoolFactory-V2.sol'; 

interface IGelatoResolverV2  {

  function createStopStreamTimedTask(
    address _supplier,
    uint256 _stopDateInMs,
    bool _all,
    uint8 _flowType
  ) external returns (bytes32 taskId);

 function createWithdraStepTask(address _supplier, uint256 _stepTime) external  returns (bytes32 taskId);

}