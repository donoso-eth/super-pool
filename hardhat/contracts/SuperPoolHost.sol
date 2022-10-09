// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "hardhat/console.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {ISTokenFactoryV2} from './interfaces/ISTokenFactory-V2.sol';

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


  console.log(address(host));

    address poolContract = Clones.clone(superPoolInput.poolFactoryImpl);

    address sTokenContract = Clones.clone(address(superPoolInput.sTokenImpl));

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
      SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

    console.log(poolContract);

    host.registerAppByFactory(ISuperApp(poolContract), configWord);

    console.log(poolContract);

    //// INITIALIZE POOL
    DataTypes.PoolFactoryInitializer memory poolFactoryInitializer;
    poolFactoryInitializer = DataTypes.PoolFactoryInitializer({
      host: host,
      superToken: superPoolInput.superToken,
      ops: superPoolInput.ops,
      token: superPoolInput.token,
      sToken: ISTokenFactoryV2(sTokenContract),
      poolStrategy: superPoolInput.poolStrategy,
      gelatoResolver: superPoolInput.gelatoResolver,
      settings: superPoolInput.settings
      
      
    });

    IPoolFactoryV2(poolContract).initialize(poolFactoryInitializer);

    ISTokenFactoryV2(sTokenContract).initialize(IPoolFactoryV2(poolContract),superPoolInput.ops,"name","symbol");

    
    superTokenResolverByAddress[address(superPoolInput.superToken)].pool = poolContract;
    superTokenResolverByAddress[address(superPoolInput.superToken)].sToken = sTokenContract ;
   
  }

  // ============= View Functions ============= ============= =============  //


  function getResolverBySuperToken(address superToken) external view returns (DataTypes.SupertokenResolver memory resolver) {

    resolver =  superTokenResolverByAddress[address(superToken)];

  }

  // #region ViewFunctions

  // #endregion View Functions
}
