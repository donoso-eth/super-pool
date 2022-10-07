//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";
import { ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

contract PoolStrategyV2 is Initializable, IPoolStrategyV2 {

    IOps ops;
    ISuperToken superToken;
    IERC20 token;
    bytes32 depositTaksId;
    IPoolFactoryV2 pool;
    uint256 poolBuffer;

    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor(){}

  // #region  ============= ============= Allocation Strategy  ============= ============= //

  function initialize(
    IOps _ops, 
    ISuperToken _superToken, 
    IERC20 _token, 
    IPoolFactoryV2 _pool,
    uint256 _poolBuffer) external initializer {
    
    ops = _ops;
    superToken = _superToken;
    token = _token;
    pool = _pool;
    poolBuffer = _poolBuffer;

  }

  function setUpMock(address _mock) public {
 
   
    depositTaksId = createDepositTask();
  }

  function upgrade(uint256 amount) internal {
    superToken.upgrade(amount);
  }

  function downgrade(uint256 amount) internal {
    superToken.downgrade(amount);
  }

  function getBalanceSuperToken() public view returns (int256 balance) {
    (balance, , , ) = superToken.realtimeBalanceOfNow(address(this));
  }

  function getBalanceToken() public view returns (uint256 balance) {
    balance = token.balanceOf(address(this));
  }

  function calculateStatus() public {
   // uint256 increment = IAllocationMock(MOCK_ALLOCATION).calculateStatus();
  }

  function withdraw (uint256 requiredAmount) override  external onlyPool {
    int256 availableBalance = int256(getBalanceSuperToken()) - int256(poolBuffer);
    uint256 withdrawalAmount;
    if (availableBalance <= 0) {
      withdrawalAmount = uint256(-availableBalance) + requiredAmount;
     // IAllocationMock(MOCK_ALLOCATION).withdraw(withdrawalAmount);
      superToken.upgrade(withdrawalAmount);
    } else if (uint256(availableBalance) < requiredAmount) {
      withdrawalAmount = requiredAmount - uint256(availableBalance);
    //  IAllocationMock(MOCK_ALLOCATION).withdraw(withdrawalAmount);
      superToken.upgrade(withdrawalAmount);
    }
  }


 function deposit(uint256 amount) override external onlyPool {
    _deposit(amount);
 }

 function _deposit(uint256 amount)internal{

 }


  /// execute 
  function createDepositTask() internal returns (bytes32 taskId) {
    taskId = ops.createTaskNoPrepayment(address(this), this.depositTask.selector, address(this), abi.encodeWithSelector(this.checkerDeposit.selector), ETH);
  }

  // called by Gelato Execs
  function checkerDeposit() external view returns (bool canExec, bytes memory execPayload) {
    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(this));

    canExec = uint256(balance) - poolBuffer >= 0.5 ether;

    execPayload = abi.encodeWithSelector(this.depositTask.selector);
  }

  function depositTask() external onlyOps {
    uint256 fee;
    address feeToken;

    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(this));

    console.log(215, uint256(balance));
    uint256 amountToDeposit = uint256(balance) - poolBuffer;
    console.log(216, amountToDeposit);
    require(amountToDeposit >= 0.5 ether, "NOT_ENOUGH_FUNDS_TO DEPOSIT");

    (fee, feeToken) = IOps(ops).getFeeDetails();

    pool.transfer(fee, feeToken);

    superToken.downgrade(amountToDeposit);
    _deposit(amountToDeposit);
  }

  // #endregion  ============= ============= Allocation Strategy  ============= ============= //

  modifier onlyPool() {
    require(msg.sender == address(pool), "Only Pool Allowed");
    _;
  }

    modifier onlyOps() {
    require(msg.sender == address(ops), "OpsReady: onlyOps");
    _;
  }

}