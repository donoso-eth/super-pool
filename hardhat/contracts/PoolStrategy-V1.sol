//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolV1} from "./interfaces/IPool-V1.sol";

import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import {IPool} from "./aave/IPool.sol";
import {ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {LibDataTypes} from "./gelato/LibDataTypes.sol";
import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";
import {UUPSProxiable} from "./upgradability/UUPSProxiable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

interface ERC20mintable {
  function mint(address receiver, uint256 amount) external;

  function mint(uint256 amount) external;

  function balanceOf(address receiver) external returns (uint256);

  function approve(address approver, uint256 amount) external;
}

contract PoolStrategyV1 is Initializable, UUPSProxiable, IPoolStrategyV1 {
  using SafeMath for uint256;

  address owner;

  IOps ops;
  ISuperToken superToken;
  ERC20mintable token;
  bytes32 public depositTaskId;
  IPoolV1 pool;
  IPoolInternalV1 poolInternal;
  IPool aavePool;
  IERC20 aToken;

  ERC20mintable aaveToken;

  uint256 POOL_BUFFER;

  uint256 MAX_INT;

  uint256 lastExecution;
  uint256 intervalExecution;

  address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

  constructor() {}


  // #region  ============= ============= Allocation Strategy  ============= ============= //

  function initialize(
    IOps _ops,
    ISuperToken _superToken,
    ERC20mintable _token,
    IPoolV1 _pool,
    IPool _aavePool,
    IERC20 _aToken,
    ERC20mintable _aaveToken,
    IPoolInternalV1 _poolInternal
  ) external initializer {
    owner = msg.sender;
    ops = _ops;
    superToken = _superToken;
    token = _token;
    pool = _pool;
    poolInternal = _poolInternal;
    POOL_BUFFER = 0; //_POOL_BUFFER;
    aavePool = _aavePool;
    aToken = _aToken;
    aaveToken = _aaveToken;
    MAX_INT = 2**256 - 1;

    aaveToken.approve(address(aavePool), MAX_INT);
    token.approve(address(superToken), MAX_INT);
    //depositTaskId = createDepositTask();

    lastExecution = block.timestamp;
    intervalExecution = 24 * 3600;
  }



  //   function pauseTask() external onlyOwner {
  //   if (depositTaskId != bytes32(0)) {
  //     ops.cancelTask(depositTaskId);
  //     depositTaskId = bytes32(0);
  //   }
  // }

  // function launchTask() external onlyOwner {
  //   if (depositTaskId != bytes32(0)) {
  //     depositTaskId = createDepositTask();
  //   }
  // }



  function withdraw(uint256 amount, address _supplier) external onlyPool {
    _withdraw(amount, _supplier);
  }

  function _withdraw(uint256 amount, address _supplier) internal {
    aavePool.withdraw(address(aaveToken), amount.div(10**12), address(this));

    uint256 balanceToken = token.balanceOf(address(this));

    if (balanceToken < amount) {
      token.mint(address(this), amount - balanceToken);
    }

    superToken.upgrade(amount);

    IERC20(address(superToken)).transfer(_supplier, amount);
  }


  // called by Gelato Execs


  function _deposit(uint256 amountToDeposit) internal {
    console.log(134);
    superToken.transferFrom(address(pool), address(this), uint256(amountToDeposit));
  console.log(136);
    superToken.downgrade(amountToDeposit);
 console.log(138);
    //poolInternal.pushedToStrategy(uint256(amountToDeposit));
     console.log(140);
    aaveToken.mint(amountToDeposit / (10**12));
     console.log(142,amountToDeposit / (10**12));
    aavePool.supply(address(aaveToken), amountToDeposit / (10**12), address(this), 0);
    console.log(144,'deposit_ok');
  }


  function pushToStrategy(uint256 amountToDeposit) external onlyPool {

      _deposit(amountToDeposit);
      console.log(149);
    
  }

  function balanceOf() external view returns (uint256 balance) {
    balance = aToken.balanceOf(address(this)) * (10**12);
  }

  // #endregion  ============= ============= Allocation Strategy  ============= ============= //

  // #region  ==================  Upgradeable settings  ==================

  function proxiableUUID() public pure override returns (bytes32) {
    return keccak256("org.super-pool.strategy.v2");
  }

  function updateCode(address newAddress) external override onlyOwner {
    return _updateCodeAddress(newAddress);
  }

  // #endregion  ==================  Upgradeable settings  ==================

  //#region modifiers

  modifier onlyOwner() {
    require(msg.sender == owner, "Only Owner");
    _;
  }

  modifier onlyPool() {
    require(msg.sender == address(pool), "Only Pool Allowed");
    _;
  }



  modifier onlyOps() {
    require(msg.sender == address(ops), "OpsReady: onlyOps");
    _;
  }

  //#endregion modifiers
}
