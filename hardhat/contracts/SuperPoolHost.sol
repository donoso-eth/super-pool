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

  mapping(address => address) public poolAdressBySuperToken;

  constructor(ISuperfluid _host) {
    host = _host;
  }

  function createSuperPool(DataTypes.SuperPoolInput memory superPoolInput) external {
    require(poolAdressBySuperToken[address(superPoolInput.superToken)] == address(0), "POOL_EXISTS");

    address poolContract = Clones.clone(superPoolInput.poolFactory);

    address sTokenContract = Clones.clone(address(superPoolInput.sToken));

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
      SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

    host.registerAppByFactory(ISuperApp(poolContract), configWord);

    //// INITIALIZE POOL
    DataTypes.PoolFactoryInitializer memory poolFactoryInitializer;
    poolFactoryInitializer = DataTypes.PoolFactoryInitializer({
      host: host,
      superToken: superPoolInput.superToken,
      ops: superPoolInput.ops,
      token: superPoolInput.token,
      sToken: ISTokenFactoryV2(sTokenContract),
      poolStrategy: superPoolInput.poolStrategy,
      gelatoResolver: superPoolInput.gelatoResolver
    });

    IPoolFactoryV2(poolContract).initialize(poolFactoryInitializer);

    ISTokenFactoryV2(sTokenContract).initialize(IPoolFactoryV2(poolContract),superPoolInput.ops,"name","symbol");

    

    poolAdressBySuperToken[address(superPoolInput.superToken)] = poolContract;

   



    console.log(poolContract);
  }

  // ============= View Functions ============= ============= =============  //

  // #region ViewFunctions

  // #endregion View Functions
}
