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
import {LibDataTypes} from "./gelato/LibDataTypes.sol";

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
    IERC20 _aToken
  ) external initializer {
    ops = _ops;
    superToken = _superToken;
    token = _token;
    pool = _pool;
    POOL_BUFFER = 0; //_POOL_BUFFER;
    aavePool = _aavePool;
    aToken = _aToken;

    MAX_INT = 2**256 - 1;

    token.approve(address(aavePool), MAX_INT);
    token.approve(address(superToken), MAX_INT);
    // superToken.approve(address(this), MAX_INT);
    depositTaksId = createDepositTask();
  }

  function withdraw(uint256 amount, address _supplier) external onlyPool {
    //require(amount < available, "NOT_ENOUGH:BALANCE");
    aavePool.withdraw(address(token), amount.div(10**12), address(this));
    console.log(73, amount);
    superToken.upgrade(amount);
       console.log(75);
  uint256 bal =   IERC20(address(superToken)).balanceOf(address(this));
  console.log(bal);
    if (bal < amount) {
      amount = bal;
    }
    IERC20(address(superToken)).transfer(_supplier, amount);
       console.log(77);
  }

  /// execute
  function createDepositTask() internal returns (bytes32 taskId) {
    bytes memory resolverData = abi.encodeWithSelector(this.checkerDeposit.selector);

    bytes memory resolverArgs = abi.encode(address(this), resolverData);

    LibDataTypes.Module[] memory modules = new LibDataTypes.Module[](1);

    modules[0] = LibDataTypes.Module.RESOLVER;

    bytes[] memory args = new bytes[](1);

    args[0] = resolverArgs;

    LibDataTypes.ModuleData memory moduleData = LibDataTypes.ModuleData(modules, args);

    taskId = IOps(ops).createTask(address(this), abi.encodePacked(this.depositTask.selector), moduleData, ETH);
  }

  // called by Gelato Execs
  function checkerDeposit() external view returns (bool canExec, bytes memory execPayload) {
    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(pool));

     uint256 currentPoolBuffer = pool.getLastPool().outFlowBuffer;

     uint256 currentThreshold = currentPoolBuffer.add(0.5 ether);

    canExec = uint256(balance) >= currentThreshold;

    execPayload = abi.encodeWithSelector(this.depositTask.selector);
  }

  function depositTask() external onlyOps {
    uint256 fee;
    address feeToken;
    (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(pool));
    console.log(113);
    uint256 currentPoolBuffer = pool.getLastPool().outFlowBuffer;

    uint256 currentThreshold = currentPoolBuffer.add(0.5 ether);


    require(uint256(balance) >= currentThreshold, "NOT_ENOUGH_FUNDS_TO DEPOSIT");

    uint256 amountToDeposit = uint256(balance) - currentThreshold + 0.5 ether;


    (fee, feeToken) = IOps(ops).getFeeDetails();

    pool.transfer(fee, feeToken);

    superToken.transferFrom(address(pool), address(this), uint256(amountToDeposit));

    superToken.downgrade(amountToDeposit);

    pool.pushedToStrategy(uint256(amountToDeposit));

    aavePool.supply(address(token), amountToDeposit / (10**12), address(this), 0);
 
  }

  function balanceOf() external view returns (uint256 balance) {
    balance = aToken.balanceOf(address(this)) * (10**12);
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
