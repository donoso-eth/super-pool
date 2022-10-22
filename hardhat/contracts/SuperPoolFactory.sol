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
import {ISTokenV1} from "./interfaces/ISToken-V1.sol";
import {STokenV1} from "./SToken-V1.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";

import {IOps} from "./gelato/IOps.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

contract SuperPoolFactory is UUPSProxiable {
    using Counters for Counters.Counter;
    Counters.Counter public _pcrTokensIssued;

    ISuperfluid host;

    IOps ops;

    address owner;

    address strategyImpl;
    address poolImpl;
    address poolInternalImpl;
    address sTokenImpl;
    mapping(address => DataTypes.SupertokenResolver) public superTokenResolverByAddress;

    /**
     * @notice initializer of the Pool
     */
    function initialize(DataTypes.SuperPoolFactoryInitializer memory factoryInitializer) external  initializer {
        host = host;
        strategyImpl = strategyImpl;
        poolImpl = poolImpl;
        poolInternalImpl = poolInternalImpl;
        sTokenImpl = sTokenImpl;
    }

    function proxiableUUID() public view override returns (bytes32) {
        return keccak256("org.super-pool.pool-factory.v2");
    }

    function updateCode(address newAddress) external override {
        require(msg.sender == owner, "only owner can update code");
        return _updateCodeAddress(newAddress);
    }

    function createSuperPool(DataTypes.CreatePoolInput memory poolInput) external {
        require(superTokenResolverByAddress[address(poolInput.superToken)].pool == address(0), "POOL_EXISTS");

        owner = msg.sender;

        ISuperToken superToken = poolInput.superToken;
        ERC20 token = ERC20(superToken.getUnderlyingToken());
        string memory tokenName = token.name();
        string memory symbol = token.symbol();

        /// Create Proxy Contracts

        UUPSProxy poolProxy = new UUPSProxy();
        poolProxy.initializeProxy(poolImpl);

        UUPSProxy sTokenProxy = new UUPSProxy();
        sTokenProxy.initializeProxy(sTokenImpl);

        UUPSProxy poolInternalProxy = new UUPSProxy();
        poolInternalProxy.initializeProxy(sTokenImpl);

        /////// Initializer Pool
        DataTypes.PoolInitializer memory poolInit;
        poolInit = DataTypes.PoolInitializer({host: host, superToken: poolInput.superToken, token: token, poolInternal: IPoolInternalV1(address(poolInternalProxy)), sToken: ISTokenV1(address(sTokenProxy)), poolStrategy: poolInput.poolStrategy, ops: ops, owner: owner});

        IPoolV1(address(poolProxy)).initialize(poolInit);

        uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL | SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP | SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP | SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;
        host.registerAppByFactory(ISuperApp(address(poolProxy)), configWord);

        //Initializer PoolInternal
        DataTypes.PoolInternalInitializer memory internalInit;
        internalInit = DataTypes.PoolInternalInitializer({superToken: poolInput.superToken, pool: IPoolV1(address(poolProxy)), sToken: ISTokenV1(address(sTokenProxy)), poolStrategy: poolInput.poolStrategy, ops: ops, owner: owner});
        IPoolInternalV1(address(poolInternalProxy)).initialize(internalInit);

        // Initializer SToken
        DataTypes.STokenInitializer memory tokenInit;
        tokenInit = DataTypes.STokenInitializer({
            name: string(abi.encodePacked("Super Pool ", tokenName)),
            symbol: string(abi.encodePacked("sp ", symbol)),
            pool: IPoolV1(address(poolProxy)),
            poolInternal: IPoolInternalV1(address(poolInternalProxy)),
            poolStrategy: poolInput.poolStrategy,
            owner: owner
        });

        ISTokenV1(address(sTokenProxy)).initialize(tokenInit);

        // superTokenResolverByAddress[address(poolInput.superToken)].pool = address(poolContract);
        // superTokenResolverByAddress[address(poolInput.superToken)].sToken = address(sTokenContract);
    }

    // ============= View Functions ============= ============= =============  //

    function getResolverBySuperToken(address superToken) external view returns (DataTypes.SupertokenResolver memory resolver) {
        resolver = superTokenResolverByAddress[address(superToken)];
    }

    // #region ViewFunctions

    // #endregion View Functions
}
