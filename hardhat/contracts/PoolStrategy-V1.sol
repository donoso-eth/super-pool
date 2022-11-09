//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {IPoolV1} from "./interfaces/IPool-V1.sol";

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

/****************************************************************************************************
 * @title PoolStrategyV1
 * @dev This contract provides the allocation strategy to be followed by the pool
 *   
 *      The addresse of the strategy will be passed to the pool factory by creation of the pool
 *      It can be created n-pools by superToken creating n-different strategies (aave, compounf, etc)
 *      By the pool initialization, the pool approve the strategy contract to operate the supertokens 
 *
 ****************************************************************************************************/
contract PoolStrategyV1 is Initializable, UUPSProxiable, IPoolStrategyV1 {
  using SafeMath for uint256;

  address owner;

  ISuperToken superToken;
  IPoolV1 pool; /// Pool
  IPool aavePool; //// aave Pool to deposit
  IERC20 aToken; //// aToken received

  ///// IN PRODUCTION WE WILL ONLY REQUIRE the token a ERC20
  ///// NOW WE NEED TO SWAP BETWEEN SUPERFLUID and AAVe FAKE TOKEN
  ERC20mintable token; // SUPERFLUID Faketoken
  ERC20mintable aaveToken; // AAVE Fake token

  uint256 MAX_INT;


  constructor() {}

  function initialize(
    ISuperToken _superToken,
    ERC20mintable _token,
    IPoolV1 _pool,
    IPool _aavePool,
    IERC20 _aToken,
    ERC20mintable _aaveToken
  ) external initializer {
    owner = msg.sender;
    superToken = _superToken;
    token = _token;
    pool = _pool;
    aavePool = _aavePool;
    aToken = _aToken;
    aaveToken = _aaveToken;
    MAX_INT = 2**256 - 1;

    aaveToken.approve(address(aavePool), MAX_INT);
    token.approve(address(superToken), MAX_INT);
  }


  function balanceOf() external view returns (uint256 balance) {
    balance = aToken.balanceOf(address(this)) * (10**12);
  }

  // #region  ============= ============= ONLY POOL FUNCTIONS  ============= ============= //
  function withdraw(uint256 amount, address _supplier) external onlyPool {
    _withdraw(amount, _supplier);
  }

  function pushToStrategy(uint256 amountToDeposit) external onlyPool {
    _deposit(amountToDeposit);
  }

  // #endregion  ============= ============= ONLY POOL FUNCTIONS  ============= ============= //

  // #region  ============= ============= INTERNAL FUNCTIONS  ============= ============= //

  ////////////// IN PRODUCTIONM REMOVE the 10**12 FACTOR aNR THE MINTING
  function _deposit(uint256 amountToDeposit) internal {
    superToken.transferFrom(address(pool), address(this), uint256(amountToDeposit));

    superToken.downgrade(amountToDeposit);

    aaveToken.mint(amountToDeposit / (10**12));

    aavePool.supply(address(aaveToken), amountToDeposit / (10**12), address(this), 0);
  }

    ////////////// IN PRODUCTIONM REMOVE the 10**12 FACTOR 
  function _withdraw(uint256 amount, address _supplier) internal {
    aavePool.withdraw(address(aaveToken), amount.div(10**12), address(this));

    uint256 balanceToken = token.balanceOf(address(this));

    if (balanceToken < amount) {
      token.mint(address(this), amount - balanceToken);
    }

    superToken.upgrade(amount);

    IERC20(address(superToken)).transfer(_supplier, amount);
  }

  // #endregion  ============= ============= INTERNAL FUNCTIONS  ============= ============= //

  // #region  ==================  Upgradeable settings  ==================

  function proxiableUUID() public pure override returns (bytes32) {
    return keccak256("org.super-pool.strategy.v2");
  }

  function updateCode(address newAddress) external override onlyOwner {
    return _updateCodeAddress(newAddress);
  }

  // #endregion  ==================  Upgradeable settings  ==================

  // #region   ==================  modifiers  ==================

  modifier onlyOwner() {
    require(msg.sender == owner, "Only Owner");
    _;
  }

  modifier onlyPool() {
    require(msg.sender == address(pool), "Only Pool Allowed");
    _;
  }

  //#endregion modifiers
}
