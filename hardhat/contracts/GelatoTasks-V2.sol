//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract GelatoTasksV2 is Initializable {
  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
  address ops;
  IPoolFactoryV2 pool;

  constructor() {}

  function initialize(address _ops, IPoolFactoryV2 _pool) external initializer {
    ops = _ops;
    pool = _pool;
  }
    
  // ============= =============  Gelato functions ============= ============= //
  // #region Gelato functions

  function createStopStreamTimedTask(
    address _supplier,
    uint256 _stopDateInMs,
    bool _all,
    uint8 _flowType
  ) external onlyPool returns (bytes32 taskId) {
    taskId = IOps(ops).createTimedTask(
      uint128(block.timestamp + _stopDateInMs),
      600,
      address(pool),
      IPoolFactoryV2.stopstream.selector,
      address(this),
      abi.encodeWithSelector(this.checkerStopStream.selector, _supplier, _all, _flowType),
      ETH,
      false
    );
  }

  // called by Gelato Execs
  function checkerStopStream(
    address _receiver,
    bool _all,
    uint8 _flowType
  ) external pure returns (bool canExec, bytes memory execPayload) {
    canExec = true;

    execPayload = abi.encodeWithSelector(IPoolFactoryV2.stopstream.selector, address(_receiver), _all, _flowType);
  }

  //#endregion

  //// Withdrawal step task
  function createWithdraStepTask(address _supplier, uint256 _stepTime) external onlyPool returns (bytes32 taskId) {
    taskId = IOps(ops).createTimedTask(
      uint128(block.timestamp + _stepTime),
      uint128(_stepTime),
      address(pool),
      IPoolFactoryV2.withdrawStep.selector,
      address(this),
      abi.encodeWithSelector(this.checkerwithdrawStep.selector, _supplier),
      ETH,
      false
    );
  }

  // called by Gelato Execs
  function checkerwithdrawStep(address _receiver) external returns (bool canExec, bytes memory execPayload) {
    canExec = true;

    execPayload = abi.encodeWithSelector(IPoolFactoryV2.withdrawStep.selector, address(_receiver));
  }

  modifier onlyPool() {
    require(msg.sender == address(pool), "Only Pool Allowed");
    _;
  }
}
