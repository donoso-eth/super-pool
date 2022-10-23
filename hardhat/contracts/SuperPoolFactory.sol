// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "hardhat/console.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {UUPSProxy} from "./upgradability/UUPSProxy.sol";
import {UUPSProxiable} from "./upgradability/UUPSProxiable.sol";

import {IPoolV1} from "./interfaces/IPool-V1.sol";
import {PoolV1} from "./Pool-V1.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";

import {IOps} from "./gelato/IOps.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";

contract SuperPoolFactory is Initializable, UUPSProxiable {
  using Counters for Counters.Counter;
  Counters.Counter public _pcrTokensIssued;

  ISuperfluid host;

  IOps ops;

  address owner;


  address poolImpl;
  address poolInternalImpl;

//  mapping(address =>   mapping (uint256 => address)) Poolb;

 mapping(address => mapping (address => DataTypes.PoolRecord))  public poolbySuperTokenStrategy;

  /**
   * @notice initializer of the Pool
   */
  function initialize(DataTypes.SuperPoolFactoryInitializer memory factoryInitializer) external initializer {
    host = factoryInitializer.host;
    ops = factoryInitializer.ops;
    poolImpl = factoryInitializer.poolImpl;
    console.log(50,poolImpl, address(this));
    poolInternalImpl = factoryInitializer.poolInternalImpl;
  }

  function proxiableUUID() public pure override returns (bytes32) {
    return keccak256("org.super-pool.pool-factory.v2");
  }

  function updateCode(address newAddress) external override {
    require(msg.sender == owner, "only owner can update code");
    return _updateCodeAddress(newAddress);
  }

  function createSuperPool(DataTypes.CreatePoolInput memory poolInput) external {
    require( poolbySuperTokenStrategy[address(poolInput.superToken)][address(poolInput.poolStrategy)].pool == address(0), "POOL_EXISTS");

    owner = msg.sender;

    ISuperToken superToken = poolInput.superToken;
    ERC20 token = ERC20(superToken.getUnderlyingToken());
    string memory tokenName = token.name();
    string memory symbol = token.symbol();

    /// Create Proxy Contracts

    UUPSProxy poolProxy = new UUPSProxy();
    console.log(75,poolImpl);
    poolProxy.initializeProxy(poolImpl);

    UUPSProxy poolInternalProxy = new UUPSProxy();
    poolInternalProxy.initializeProxy(poolInternalImpl);

    /////// Initializer Pool
    DataTypes.PoolInitializer memory poolInit;
    poolInit = DataTypes.PoolInitializer({
      name: string(abi.encodePacked("Super Pool ", tokenName)),
      symbol: string(abi.encodePacked("sp ", symbol)),
      host: host,
      superToken: poolInput.superToken,
      token: token,
      poolInternal: IPoolInternalV1(address(poolInternalProxy)),
      poolStrategy: poolInput.poolStrategy,
      ops: ops,
      owner: owner
    });

    IPoolV1(address(poolProxy)).initialize(poolInit);

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL | SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP | SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP | SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;
    host.registerAppByFactory(ISuperApp(address(poolProxy)), configWord);

    //Initializer PoolInternal
    DataTypes.PoolInternalInitializer memory internalInit;
    internalInit = DataTypes.PoolInternalInitializer({superToken: poolInput.superToken, pool: IPoolV1(address(poolProxy)), poolStrategy: poolInput.poolStrategy, ops: ops, owner: owner});
    IPoolInternalV1(address(poolInternalProxy)).initialize(internalInit);

    poolbySuperTokenStrategy[address(poolInput.superToken)][address(poolInput.poolStrategy)].pool = address(poolProxy);
    poolbySuperTokenStrategy[address(poolInput.superToken)][address(poolInput.poolStrategy)].poolInternal = address(poolInternalProxy);

    console.log(107,address(poolProxy));

  }

  // ============= View Functions ============= ============= =============  //

  function getRecordBySuperTokenAddress(address _superToken, address _poolStrategy) external view returns (DataTypes.PoolRecord memory poolRecord) {
    poolRecord = poolbySuperTokenStrategy[_superToken][_poolStrategy];
  }

  // #region ViewFunctions

  // #endregion View Functions
}
