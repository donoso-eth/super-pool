// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import { Clones } from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import { SafeERC20, IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import { ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { UUPSProxy } from "./upgradability/UUPSProxy.sol";
import { UUPSProxiable } from "./upgradability/UUPSProxiable.sol";
import { IUUPSProxiable } from "./upgradability/IUUPSProxiable.sol";

import { IPoolV1 } from "./interfaces/IPool-V1.sol";
import { PoolV1 } from "./Pool-V1.sol";
import { IPoolInternalV1 } from "./interfaces/IPoolInternal-V1.sol";

import { IOps } from "./gelato/IOps.sol";

import { DataTypes } from "./libraries/DataTypes.sol";
import { Events } from "./libraries/Events.sol";
import { Initializable } from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import { IPoolStrategyV1 } from "./interfaces/IPoolStrategy-V1.sol";

contract SuperPoolFactory is Initializable, UUPSProxiable {
  using Counters for Counters.Counter;

  Counters.Counter public pools;

  ISuperfluid host;

  IOps ops;

  address owner;

  address poolImpl;
  address poolInternalImpl;

  mapping(address => mapping(address => uint256)) public poolIdBySuperTokenStrategy;

  mapping(address => uint256) nrStrategiesPerSuperToken;

  mapping(address => mapping(uint256 => uint256)) public poolIdBySuperTokenAndId;

  mapping(uint256 => DataTypes.PoolInfo) public poolInfoById;

  /**
   * @notice initializer of the Pool
   */
  function initialize(DataTypes.SuperPoolFactoryInitializer memory factoryInitializer) external initializer {
    host = factoryInitializer.host;
    ops = factoryInitializer.ops;
    poolImpl = factoryInitializer.poolImpl;
    poolInternalImpl = factoryInitializer.poolInternalImpl;
  }

  function createSuperPool(DataTypes.CreatePoolInput memory poolInput) external {
    DataTypes.PoolInfo memory existsPool = poolInfoById[poolIdBySuperTokenStrategy[poolInput.superToken][poolInput.poolStrategy]];
    require(existsPool.pool == address(0), "POOL_EXISTS");

    pools.increment();
    nrStrategiesPerSuperToken[poolInput.superToken] = nrStrategiesPerSuperToken[poolInput.superToken] + 1;

    uint256 poolNrBysuperToken = nrStrategiesPerSuperToken[poolInput.superToken];

    owner = msg.sender;

    ISuperToken superToken = ISuperToken(poolInput.superToken);
    ERC20 token = ERC20(superToken.getUnderlyingToken());
    string memory tokenName = token.name();
    string memory symbol = token.symbol();
    console.log(tokenName);
    console.log(symbol);
    console.logBytes32(bytes32(abi.encodePacked("sp", symbol)));
    /// Create Proxy Contracts

    UUPSProxy poolProxy = new UUPSProxy();
    poolProxy.initializeProxy(poolImpl);

    // UUPSProxy poolInternalProxy = new UUPSProxy();
    // poolInternalProxy.initializeProxy(poolInternalImpl);

    /////// Initializer Pool
    DataTypes.PoolInitializer memory poolInit;
    poolInit = DataTypes.PoolInitializer({
      id: pools.current(),
      name: string(abi.encodePacked("Super Pool ", tokenName)),
      symbol: string(abi.encodePacked("sp", symbol)),
      host: host,
      superToken: ISuperToken(poolInput.superToken),
      token: token,
      poolInternal: poolInternalImpl,
      poolStrategy: IPoolStrategyV1(poolInput.poolStrategy),
      ops: ops,
      owner: owner
    });

    IPoolV1(address(poolProxy)).initialize(poolInit);

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL | SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP | SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP | SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;
    host.registerAppByFactory(ISuperApp(address(poolProxy)), configWord);

    //Initializer PoolInternal

    DataTypes.PoolInfo memory poolInfo = DataTypes.PoolInfo({id: pools.current(), idPerSupertoken: poolNrBysuperToken, superToken: poolInput.superToken, strategy: poolInput.poolStrategy, pool: address(poolProxy), poolInternal: poolInternalImpl});

    poolInfoById[poolInfo.id] = poolInfo;
    poolIdBySuperTokenStrategy[poolInput.superToken][poolInput.poolStrategy] = poolInfo.id;
    poolIdBySuperTokenAndId[poolInput.superToken][poolNrBysuperToken] = poolInfo.id;
  }

  // #region============ Upgradeability ============= ============= =============  //

  function changePoolImplementation(address newImpl, address superToken, address poolStrategy) external onlyOwner {
    uint256 poolId = poolIdBySuperTokenStrategy[superToken][poolStrategy];
    DataTypes.PoolInfo memory poolInfo = poolInfoById[poolId];
    IUUPSProxiable(poolInfo.pool).updateCode(newImpl);
    poolImpl = newImpl;
  }

  function changePoolInternalImplementation(address newImpl, address superToken, address poolStrategy) external onlyOwner {
    uint256 poolId = poolIdBySuperTokenStrategy[superToken][poolStrategy];
    DataTypes.PoolInfo memory poolInfo = poolInfoById[poolId];
    IUUPSProxiable(poolInfo.poolInternal).updateCode(newImpl);
    poolInternalImpl = newImpl;
  }

  function proxiableUUID() public pure override returns (bytes32) {
    return keccak256("org.super-pool.pool-factory.v2");
  }

  function updateCode(address newAddress) external override {
    require(msg.sender == owner, "only owner can update code");
    return _updateCodeAddress(newAddress);
  }

  // #endregion============ Upgradeability ============= ============= =============  //

  // #region ==== View Functions ============= ============= =============  //

  function getRecordBySuperTokenAddress(address _superToken, address _poolStrategy) external view returns (DataTypes.PoolInfo memory poolInfo) {
    uint256 poolId = poolIdBySuperTokenStrategy[_superToken][_poolStrategy];
    poolInfo = poolInfoById[poolId];
  }

  function getVersion() external pure returns (uint256) {
    return 1.0;
  }
  // #endregion View Functions

  modifier onlyOwner() {
    require(msg.sender == owner, "Only Owner");
    _;
  }
}
