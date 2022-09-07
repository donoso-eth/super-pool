// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;
import "hardhat/console.sol";
import {Clones} from "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

 import {IPoolFactory} from "./interfaces/IPoolFactory.sol";


import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";


contract SuperPoolHost  {
  using Counters for Counters.Counter;
  Counters.Counter public _pcrTokensIssued;

  ISuperfluid host;

  mapping(address => address) public poolAdressBySuperToken;



  constructor(ISuperfluid _host) {
    host = _host;
  }
  
  function createSuperPool(
    DataTypes.SuperPoolInput memory superPoolInput
  ) external {

    require(poolAdressBySuperToken[superPoolInput.superToken] == address(0), 'POOL_EXISTS');


    address poolContract = Clones.clone(superPoolInput.poolFactory);



    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
      SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;


    host.registerAppByFactory(ISuperApp(poolContract),configWord);

    //// INITIALIZE TOJEN cONTRACT WITH
    DataTypes.PoolFactoryInitializer memory poolFactoryInitializer;
    poolFactoryInitializer = DataTypes.PoolFactoryInitializer ({
      host:host,
      superToken:ISuperToken(superPoolInput.superToken),
      ops:superPoolInput.ops,
      token:IERC20(superPoolInput.token)
    });


   

    IPoolFactory(poolContract).initialize(poolFactoryInitializer);

    poolAdressBySuperToken[superPoolInput.superToken] = poolContract;

    console.log(poolContract);


  }

  // ============= View Functions ============= ============= =============  //

  // #region ViewFunctions


  // #endregion View Functions
}
