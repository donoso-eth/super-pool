// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "hardhat/console.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

 import {IPoolFactory} from "./interfaces/IPoolFactory.sol";
// import {IPcrOptimisticOracle} from "./interfaces/IPcrOptimisticOracle.sol";
// import {IPcrHost} from "./interfaces/IPcrHost.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";


contract SuperPoolHost  {
  using Counters for Counters.Counter;
  Counters.Counter public _pcrTokensIssued;

  ISuperfluid host;

  mapping(address => uint256) private _pcrTokensByUser;

  constructor(ISuperfluid _host) {
    host = _host;
  }
  
  function createSuperPool(
    DataTypes.SuperPoolInput memory superPoolInput

  ) external {



    address poolContract = Clones.clone(superPoolInput.poolFactory);

    //// CLONE Pool Factory

    address poolTokenContract= Clones.clone(superPoolInput.poolTokenFactory);

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
      SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;


    host.registerAppByFactory(ISuperApp(poolTokenContract),configWord);

    //// INITIALIZE TOJEN cONTRACT WITH
    DataTypes.PoolFactoryInitializer memory poolFactoryInitializer;
    poolFactoryInitializer = DataTypes.PoolFactoryInitializer ({
      host:host,
      superToken:ISuperToken(superPoolInput.superToken)
    });

    IPoolFactory(poolContract).initialize(poolFactoryInitializer);

  }

  // ============= View Functions ============= ============= =============  //

  // #region ViewFunctions


  // #endregion View Functions
}
