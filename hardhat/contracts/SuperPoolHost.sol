// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "hardhat/console.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol";
import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {IPoolV2} from "./interfaces/IPoolFactory-V2.sol";
import {PoolV2} from "./PoolFactory-V2.sol";
import {ISTokenV2} from "./interfaces/ISTokenFactory-V2.sol";
import {IResolverSettingsV2} from "./interfaces/IResolverSettings-V2.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

contract SuperPoolHost {
    using Counters for Counters.Counter;
    Counters.Counter public _pcrTokensIssued;

    ISuperfluid host;

    mapping(address => DataTypes.SupertokenResolver) public superTokenResolverByAddress;

    constructor(ISuperfluid _host) {
        host = _host;
    }

    function createSuperPool(DataTypes.SuperPoolInput memory superPoolInput) external {
        require(superTokenResolverByAddress[address(superPoolInput.superToken)].pool == address(0), "POOL_EXISTS");
        //// INITIALIZE POOL
        DataTypes.PoolFactoryInitializer memory poolFactoryInitializer;
        poolFactoryInitializer = DataTypes.PoolFactoryInitializer({
            host: host,
            superToken: superPoolInput.superToken,
            token: superPoolInput.token,
            resolverSettings: superPoolInput.settings,
            owner: msg.sender
        });

        address poolContract = Clones.clone(superPoolInput.poolFactoryImpl);

        //    ERC1967Proxy proxy = new ERC1967Proxy(
        //     superPoolInput.poolFactoryImpl,
        //     abi.encodeWithSelector(PoolV2(address(0)).initialize.selector, poolFactoryInitializer)
        // );

        address sTokenContract = Clones.clone(address(superPoolInput.sTokenImpl));

        uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
            SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
            SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

        host.registerAppByFactory(ISuperApp(poolContract), configWord);

        IResolverSettingsV2(superPoolInput.settings).initialize(superPoolInput.settingsInitializer, poolContract, sTokenContract);

        IPoolV2(poolContract).initialize(poolFactoryInitializer);

        ISTokenV2(sTokenContract).initialize(superPoolInput.settings, "Super Pool Token USDC", "sUSDC");

        
        IPoolV2(poolContract).setToken();
        ISTokenV2(sTokenContract).setPool();

        superTokenResolverByAddress[address(superPoolInput.superToken)].pool = poolContract;
        superTokenResolverByAddress[address(superPoolInput.superToken)].sToken = sTokenContract;
    }

    // ============= View Functions ============= ============= =============  //

    function getResolverBySuperToken(address superToken) external view returns (DataTypes.SupertokenResolver memory resolver) {
        resolver = superTokenResolverByAddress[address(superToken)];
    }

    // #region ViewFunctions

    // #endregion View Functions
}
