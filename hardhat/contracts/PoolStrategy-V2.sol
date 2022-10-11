//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";
import {IPool} from "./aave/IPool.sol";
import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

contract PoolStrategyV2 is Initializable, IPoolStrategyV2 {
  using SafeMath for uint256;

  IOps ops;
  ISuperToken superToken;
  IERC20 token;
  bytes32 depositTaksId;
  IPoolFactoryV2 pool;
  IPool aavePool;
  IERC20 aToken;

  uint256 POOL_BUFFER;

  uint256 MAX_INT;

  uint256 mockLast;
  uint256 timestampLast;
  uint256 public yieldIndex;
  uint256 public pushedBalance;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor() {}

  // #region  ============= ============= Allocation Strategy  ============= ============= //

  function initialize(
    IOps _ops,
    ISuperToken _superToken,
    IERC20 _token,
    IPoolFactoryV2 _pool,
    IPool _aavePool,
    IERC20 _aToken,
    uint256 _POOL_BUFFER
  ) external initializer {
    ops = _ops;
    superToken = _superToken;
    token = _token;
    pool = _pool;
    POOL_BUFFER = _POOL_BUFFER;
    aavePool = _aavePool;
    aToken = _aToken;

    MAX_INT = 2**256 - 1;

    token.approve(address(aavePool), MAX_INT);
    //depositTaksId = createDepositTask();
  }


  function withdraw(uint256 amount, address _supplier) external onlyPool {
    //require(amount < available, "NOT_ENOUGH:BALANCE");
    aavePool.withdraw(address(token), amount.div(10**12), address(this));
    superToken.upgrade(amount);
    IERC20(address(superToken)).transfer(_supplier, amount);
  }


  /// execute
  function createDepositTask() internal returns (bytes32 taskId) {
    taskId = ops.createTaskNoPrepayment(address(this), this.depositTask.selector, address(this), abi.encodeWithSelector(this.checkerDeposit.selector), ETH);
  }

  // called by Gelato Execs
  function checkerDeposit() external view returns (bool canExec, bytes memory execPayload) {
    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(this));

    canExec = uint256(balance) - POOL_BUFFER >= 0.5 ether;

    execPayload = abi.encodeWithSelector(this.depositTask.selector);
  }

  function depositTask() external onlyOps {
    uint256 fee;
    address feeToken;

    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(this));

    console.log(215, uint256(balance));
    uint256 amountToDeposit = uint256(balance) - POOL_BUFFER;
    console.log(216, amountToDeposit);
    require(amountToDeposit >= 0.5 ether, "NOT_ENOUGH_FUNDS_TO DEPOSIT");

    (fee, feeToken) = IOps(ops).getFeeDetails();

    pool.transfer(fee, feeToken);


    superToken.transferFrom(address(pool), address(this), uint256(amountToDeposit));
    superToken.downgrade(amountToDeposit);
    aavePool.supply(address(token), amountToDeposit , address(this), 0);
    pool.pushedToStrategy(uint256(amountToDeposit ));
  }

  function balanceOf() view external returns (uint256 balance) {
    balance = aToken.balanceOf(address(this));
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
