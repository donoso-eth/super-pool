//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";
import { LibDataTypes} from './gelato/LibDataTypes.sol';

import {IPoolV2} from "./interfaces/IPool-V2.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import {IPoolInternalV2} from "./interfaces/IPoolInternal-V2.sol";



contract GelatoTasksV2 is Initializable {
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address ops;
  IPoolV2 pool;
   IPoolInternalV2 poolInternal;
  constructor() {}

  function initialize(address _ops, IPoolV2 _pool , IPoolInternalV2 _poolInternal) external initializer {
    ops = _ops;
    pool = _pool;
     poolInternal = _poolInternal;
  }
    
  // ============= =============  Gelato functions ============= ============= //
  // #region Gelato functions

  function createStopStreamTimedTask(
    address _supplier,
    uint256 _stopDateInMs,
    bool _all,
    uint8 _flowType
  ) external onlyInternal returns (bytes32 taskId) {
    
    
     bytes memory timeArgs = abi.encode(uint128(block.timestamp + _stopDateInMs), 600);

     bytes memory execData = abi.encodeWithSelector(IPoolV2.stopstream.selector, address(_supplier), _all, _flowType);

     LibDataTypes.Module[] memory modules;
     modules[0] =LibDataTypes.Module.TIME;

    bytes[] memory args;
    args[0] =  timeArgs;

    LibDataTypes.ModuleData  memory moduleData =LibDataTypes.ModuleData( modules, args);
  
    taskId = IOps(ops).createTask(
    address(pool),
    execData,
    moduleData,
    ETH
    );
  }


  //#endregion


 function cancelTask (bytes32 taskId) external onlyInternal {
  IOps(ops).cancelTask(taskId);
 }

  //// Withdrawal step task
  function createWithdraStepTask(address _supplier, uint256 _stepTime) external onlyInternal returns (bytes32 taskId) {
    
     
     bytes memory timeArgs = abi.encode(uint128(block.timestamp + _stepTime), _stepTime);

     bytes memory execData = abi.encodeWithSelector(poolInternal.withdrawStep.selector, _supplier );

    LibDataTypes.Module[] memory modules = new LibDataTypes.Module[](1);

    modules[0] = LibDataTypes.Module.TIME;


    bytes[] memory args =  new  bytes[](1);

    args[0] =  timeArgs;

    LibDataTypes.ModuleData  memory moduleData =LibDataTypes.ModuleData( modules, args);


    
    taskId = IOps(ops).createTask(
    address(poolInternal),
    execData,
    moduleData,
    ETH
    );
console.logBytes32(taskId);

  }


  modifier onlyInternal() {
    require(msg.sender == address(poolInternal), "Only Pool Internal");
    _;
  }
}
