import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { initEnv, mineBlocks, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { expect } from 'chai';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import {
  ERC20,
  ERC20__factory,
  ERC777,
  ERC777__factory,
  Events__factory,
  GelatoResolverV2,
  GelatoResolverV2__factory,
  IOps,
  IOps__factory,
  ISuperfluidToken,
  ISuperfluidToken__factory,
  ISuperToken,
  ISuperToken__factory,
  PoolFactoryV2,
  PoolFactoryV2__factory,
  PoolStrategyV2,
  PoolStrategyV2__factory,
  SettingsV2,
  SettingsV2__factory,
  STokenFactoryV2,
  STokenFactoryV2__factory,
  SuperPoolHost,
  SuperPoolHost__factory,
} from '../typechain-types';

import { BigNumber, constants, utils } from 'ethers';
import { addUser, fromBnToNumber, getPool, getTimestamp, increaseBlockTime, matchEvent, printPeriod, printPoolResult, printUser, testPeriod } from './helpers/utils-V2';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';
import { concatMap, from } from 'rxjs';
import { ethers } from 'hardhat';

import { readFileSync } from 'fs-extra';
import { INETWORK_CONFIG } from 'hardhat/helpers/models';
import { join } from 'path';
import { applyUserEvent, faucet, SupplierEvent, updatePool } from './helpers/logic-V2';
import { ICONTRACTS_TEST, IPOOL_RESULT, IUSERS_TEST, IUSERTEST } from './helpers/models-V2';

import { abi_erc20mint } from '../helpers/abis/ERC20Mint';

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactoryV2;
let sTokenFactory: STokenFactoryV2;
let gelatoResolver: GelatoResolverV2;
let poolStrategy: PoolStrategyV2;
let settings: SettingsV2;

let superPool: PoolFactoryV2;
let superPoolAddress: string;
let sToken: STokenFactoryV2;
let sTokenAddress: string;

let superTokenContract: ISuperToken;

let superTokenERC777: ERC777;
let contractsTest: ICONTRACTS_TEST;


const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;

let executor: any;
let provider: BaseProvider;
let abiCoder: utils.AbiCoder
let eventsLib: any;
let sf: Framework;

let t0: number;
let ops: IOps;
let erc777: ERC777;
let tokenContract: ERC20;

let superPoolBalance: number;
let user1Balance: BigNumber;
let user2Balance: BigNumber;
let user3Balance: BigNumber;
let user4Balance: BigNumber;

let superTokenResolver;

let pools: {[key:number]: IPOOL_RESULT} = {};

let loanStream: IWeb3FlowInfo;
let fromUser1Stream: IWeb3FlowInfo;
let fromUser2Stream: IWeb3FlowInfo;
let fromUser3Stream: IWeb3FlowInfo;
let fromUser4Stream: IWeb3FlowInfo;
let PRECISSION: BigNumber;
let initialBalance: BigNumber;

let execData;
let execAddress;
let execSelector;
let resolverAddress;
let resolverData;
let resolverHash;

let taskId;

let ONE_DAY = 24 * 3600;
const processDir = process.cwd();
let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];

describe.only('V2 test', function () {




  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: `https://goerli.infura.io/v3/1e43f3d31eea4244bf25ed4c13bfde0e`,
            blockNumber: 7704180,
          },
        },
      ],
    });

    [deployer, user1, user2, user3, user4] = await initEnv(hre);

    abiCoder = new utils.AbiCoder();




    provider = hre.ethers.provider;

    superPoolHost = await new SuperPoolHost__factory(deployer).deploy(network_params.host);
    console.log('Host---> deployed');
    poolFactory = await new PoolFactoryV2__factory(deployer).deploy();
    console.log('Pool Factory---> deployed: ', poolFactory.address);
    sTokenFactory = await new STokenFactoryV2__factory(deployer).deploy();
    console.log('Token Factotokery---> deployed');

    //
    gelatoResolver = await new GelatoResolverV2__factory(deployer).deploy();
    console.log('Gelato Resolver---> deployed');

    poolStrategy = await new PoolStrategyV2__factory(deployer).deploy();
    console.log('Pool Strategy---> deployed');

    settings = await new SettingsV2__factory(deployer).deploy();
    console.log('Settings ---> deployed');

    eventsLib = await new Events__factory(deployer).deploy();

    superTokenContract = await ISuperToken__factory.connect(network_params.superToken, deployer);
    superTokenERC777 = await ERC777__factory.connect(network_params.superToken, deployer);
    tokenContract = new hre.ethers.Contract(network_params.token, abi_erc20mint, deployer) as ERC20;

    let superInputStruct: SuperPoolInputStruct = {
      poolFactoryImpl: poolFactory.address,
      sTokenImpl: sTokenFactory.address,
      superToken: network_params.superToken,
      ops: network_params.ops,
      token: network_params.token,
      gelatoResolver: gelatoResolver.address,
      poolStrategy: poolStrategy.address,
      settings: settings.address,
    };

    await superPoolHost.createSuperPool(superInputStruct);
    console.log('SuperPool ---> created');
    superTokenResolver = await superPoolHost.getResolverBySuperToken(network_params.superToken);

    superPoolAddress = superTokenResolver.pool;
    sTokenAddress = superTokenResolver.sToken;

    await gelatoResolver.initialize(network_params.ops, superPoolAddress);
    console.log('Gelato resolver ---> initialized');
    await poolStrategy.initialize(network_params.ops, network_params.superToken, network_params.token, superPoolAddress, 5);
    console.log('Pool Strategy ---> initialized');

    await settings.initialize();
    console.log('Settings ---> initialized');

    superPool = PoolFactoryV2__factory.connect(superPoolAddress, deployer);
    sToken = STokenFactoryV2__factory.connect(sTokenAddress, deployer);

    let initialPoolEth = hre.ethers.utils.parseEther('10');

    await deployer.sendTransaction({ to: superPoolAddress, value: initialPoolEth });

    superTokenERC777.approve(superPoolAddress, hre.ethers.constants.MaxUint256);

    ops = IOps__factory.connect(network_params.ops, deployer);

    /// let balance
    let balance_deployer = await superTokenERC777.balanceOf(deployer.address);

    await faucet(deployer, tokenContract, superTokenContract);

    balance_deployer = await superTokenERC777.balanceOf(deployer.address);

    /////// INITIAL POOL BALANCE /////////
    initialBalance = utils.parseEther('1000');

    await superTokenERC777.transfer(superPoolAddress, initialBalance);

    await faucet(deployer, tokenContract, superTokenContract);

    await faucet(user1, tokenContract, superTokenContract);

    await faucet(user2,tokenContract,superTokenContract)

    let balance = await tokenContract.balanceOf(superPoolAddress);

    //throw new Error("");

    t0 = +(await superPool.lastPoolTimestamp());

  

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [network_params.opsExec],
    });

    executor = await hre.ethers.provider.getSigner(network_params.opsExec);

    contractsTest = {
      poolAddress: superPoolAddress,
      superTokenContract: superTokenContract,
      superPool: superPool,
      sToken: sToken,
      superTokenERC777,
    };

    PRECISSION = await settings.getPrecission();

    sf = await Framework.create({
      chainId:31337,
      provider: provider,
      customSubgraphQueriesEndpoint: 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-goerli',
      resolverAddress: network_params.sfResolver,
    });


  });

  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //

    t0 = +(await superPool.lastPoolTimestamp());
    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 20 units at t0 ');

    erc777 = await ERC777__factory.connect(network_params.superToken, user1);



    let amount = utils.parseEther('500');

    await erc777.send(superPoolAddress, amount, '0x');


    let t1 = await superPool.lastPoolTimestamp();


    
   let result: [IUSERS_TEST, IPOOL_RESULT];

    let expedtedPoolBalance = initialBalance.add(amount);

    let poolExpected1: IPOOL_RESULT = {
      id: BigNumber.from(1),
      timestamp: t1,
      poolTotalBalance: expedtedPoolBalance,
      totalShares: amount,
      deposit: amount.mul(PRECISSION),
      depositFromInFlowRate: BigNumber.from(0),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      outFlowAssetsRate: BigNumber.from(0),
      yieldTokenIndex: BigNumber.from(0),
      yieldInFlowRateIndex: BigNumber.from(0),
      yieldAccrued: BigNumber.from(0),
      yieldSnapshot: BigNumber.from(0),
      totalYield: BigNumber.from(0),
      apy: BigNumber.from(0),
      apySpan: t1.sub(BigNumber.from(t0)),
    };



    pools[+poolExpected1.timestamp] = poolExpected1;


    let usersPool:{ [key:string]: IUSERTEST} = {
    [user1.address]:{
        name: 'User1',
        address: user1.address,
        expected: {
          id:BigNumber.from(1),
          realTimeBalance: amount,
          shares: amount,
          tokenBalance: initialBalance.sub(amount),
          deposit: amount.mul(PRECISSION),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(t1),
        },
      },
    }
 


    await testPeriod(BigNumber.from(t0), +t1-t0, poolExpected1, contractsTest, usersPool);

    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tests passed ');

    // #endregion ============== FIRST PERIOD ============================= //

    // #region ================= SECOND PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#2--- deposit into strategy gelato to aave');

    let balance = await superTokenContract.realtimeBalanceOfNow(superPoolAddress);
 


    await setNextBlockTimestamp(hre, +t1  + ONE_DAY);
    let timestamp = t1.add(BigNumber.from(ONE_DAY));
   
    let lastPool:IPOOL_RESULT  = poolExpected1; 

    await waitForTx(poolStrategy.depositMock())

    let yieldIndex = await poolStrategy.yieldIndex();
    let pushedAmount = await poolStrategy.pushedBalance();

   

    let pool = updatePool(lastPool,timestamp,BigNumber.from(0),PRECISSION)
   
    let payload = abiCoder.encode(
      [ 'uint96'],
      [ balance.availableBalance ]
    )

    let lastUsersPool:IUSERS_TEST = usersPool;
    expedtedPoolBalance = initialBalance.add(amount);



    result =  await applyUserEvent(SupplierEvent.PUSHTOSTRATEGY,constants.AddressZero,payload,lastUsersPool,pool,pools,PRECISSION)

    pools[+timestamp] = pool;



    await testPeriod(BigNumber.from(t0),+t1+ ONE_DAY,result[1], contractsTest, result[0])

    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');
    // #endregion ================= SECOND PERIOD ============================= //




    

    // #region =================  THIRD PERIOD ============================= //
   
    await setNextBlockTimestamp(hre,  +t1 + 2*ONE_DAY);
    timestamp = t1.add(BigNumber.from( 2 * ONE_DAY));
    console.log('\x1b[36m%s\x1b[0m', '#3--- User2 provides starts a stream at t0 + 2*  One Day ');



    let flowRate = utils.parseEther("100").div(ONE_DAY*30)

    const createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolAddress,
      flowRate: flowRate.toString(),
      superToken: network_params.superToken,
    });
    await createFlowOperation.exec(user2);

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: user2.address,
      receiver: superPoolAddress,
      providerOrSigner: user2,
    });

 
  let yieldPool = BigNumber.from(ONE_DAY).mul(yieldIndex).mul(pushedAmount).div(365*ONE_DAY*100);
  let deposiTindex = yieldPool.mul(PRECISSION).div(amount)


   lastPool= Object.assign({},pool);
    
   lastUsersPool =Object.assign({},usersPool)

    let  pool3 = updatePool(lastPool,timestamp,pushedAmount.add(yieldPool),PRECISSION)
     payload = abiCoder.encode(
      [ 'int96'],
      [ flowRate ]
    )

    if (lastUsersPool[user2.address] == undefined) {
      lastUsersPool[user2.address] = addUser(user2.address,2,timestamp)
    }

   result =  await applyUserEvent(SupplierEvent.STREAMSTART,user2.address,payload,lastUsersPool,pool3,pools,PRECISSION)

  
   // await printPoolResult(pool)

    user1Balance = await sToken.balanceOf(user1.address);



    // usersTest = [
    //   {
    //     name: 'User1',
    //     address: user1.address,
    //     expected: {
    //       id:BigNumber.from(1),
    //       realTimeBalance: user1Balance,
    //       shares: amount,
    //       tokenBalance: initialBalance.sub(amount),
    //       deposit: amount.mul(PRECISSION),
    //       outAssets: BigNumber.from(0),
    //       outFlow: BigNumber.from(0),
    //       inFlow: BigNumber.from(0),
    //       timestamp: BigNumber.from(t1),
    //     },
    //   },
    //   {
    //     name: 'User2',
    //     address: user2.address,
    //     expected: {
    //       id:BigNumber.from(2),
    //       realTimeBalance: BigNumber.from(0),
    //       shares: BigNumber.from(0),
    //       tokenBalance: initialBalance.sub(fromUser2Stream.deposit),
    //       deposit: BigNumber.from(0),
    //       outAssets: BigNumber.from(0),
    //       outFlow: BigNumber.from(0),
    //       inFlow: BigNumber.from(flowRate),
    //       timestamp: t1.add(BigNumber.from(2*ONE_DAY)),
    //     },
    //   },
    // ];


    
    await testPeriod(BigNumber.from(t0),+t1 +  ONE_DAY*2, result[1], contractsTest, result[0])


   
    // #endregion ================= THIRD PERIOD ============================= //

 
    throw new Error("");
    

    // #region =================  FOURTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#4--- User2 provides ssends 300 at t0 + 3*  One Day ');



    await setNextBlockTimestamp(hre,  +t1 + 3 * ONE_DAY);
    erc777 = await ERC777__factory.connect(network_params.superToken, user1);
    amount = utils.parseEther('300');
    await waitForTx(erc777.send(superPoolAddress, amount, '0x'));
 


    lastPool = pool;

    console.log(471,lastPool.deposit.toString())




   
    //await testPeriod(BigNumber.from(t0), +t1 + 3*ONE_DAY, pool, contractsTest, usersTest);


    // await waitForTx(poolStrategy.depositMock())
    // await setNextBlockTimestamp(hre, t0 + 3 * ONE_DAY);

    // await waitForTx(erc777.send(superPoolAddress, amount, '0x'));

    // await testPeriod(BigNumber.from(t0), 3*ONE_DAY, poolExpected, contractsTest, usersTest);



  });
});
