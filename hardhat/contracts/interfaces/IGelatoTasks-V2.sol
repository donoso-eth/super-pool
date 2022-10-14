//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IPoolFactoryV2 } from './IPoolFactory-V2.sol'; 

interface IGelatoTasksV2  {

  function createStopStreamTimedTask(
    address _supplier,
    uint256 _stopDateInMs,
    bool _all,
    uint8 _flowType
  ) external returns (bytes32 taskId);

 function createWithdraStepTask(address _supplier, uint256 _stepTime,uint256 _stepAmount, uint256 minBalance) external  returns (bytes32 taskId);

}