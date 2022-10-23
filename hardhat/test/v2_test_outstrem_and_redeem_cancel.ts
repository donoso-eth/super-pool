import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { initEnv, mineBlocks, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { expect } from 'chai';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import {
  ERC20,
  ERC20__factory,
  IERC777,
  IERC777__factory,
  Events__factory,

  IOps,
  IOps__factory,
  ISuperfluidToken,
  ISuperfluidToken__factory,
  ISuperToken,
  ISuperToken__factory,

  IERC20,
  IERC20__factory,
} from '../typechain-types';

import { constants, utils } from 'ethers';
import { addUser, fromBnToNumber, getPool, getTimestamp, increaseBlockTime, matchEvent,printPoolResult, printUser, testPeriod } from './helpers/utils-V1';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { concatMap, from } from 'rxjs';
import { ethers } from 'hardhat';

import { readFileSync } from 'fs-extra';
import { INETWORK_CONFIG } from 'hardhat/helpers/models';
import { join } from 'path';
import { applyUserEvent, faucet, updatePool } from './helpers/logic-V1';
import { ICONTRACTS_TEST, IPOOL_RESULT, IUSERS_TEST, IUSERTEST, SupplierEvent } from './helpers/models-V1';

import { abi_erc20mint } from '../helpers/abis/ERC20Mint';
import { gelatoPushToAave, gelatoWithdrawStep, getGelatoWithdrawStepId } from './helpers/gelato-V1';

import { BigNumber } from '@ethersproject/bignumber';
import { CreatePoolInputStruct, SuperPoolFactory, SuperPoolFactoryInitializerStruct } from '../typechain-types/SuperPoolFactory';
import { PoolV1 } from '../typechain-types/PoolV1';
import { PoolStrategyV1 } from '../typechain-types/PoolStrategyV1';
import { PoolInternalV1 } from '../typechain-types/PoolInternalV1';
import { PoolInternalV1__factory } from '../typechain-types/factories/PoolInternalV1__factory';
import { PoolStrategyV1__factory } from '../typechain-types/factories/PoolStrategyV1__factory';
import { PoolV1__factory } from '../typechain-types/factories/PoolV1__factory';
import { SuperPoolFactory__factory } from '../typechain-types/factories/SuperPoolFactory__factory';

let superPoolFactory: SuperPoolFactory;
let poolFactory: PoolV1;

let poolStrategy: PoolStrategyV1;

let poolInternal: PoolInternalV1;

let superPool: PoolV1;
let superPoolAddress: string;


let superTokenContract: ISuperToken;

let superTokenERC777: IERC777;
let contractsTest: ICONTRACTS_TEST;

let aavePool = '0x368EedF3f56ad10b9bC57eed4Dac65B26Bb667f6';
let aToken = '0x1Ee669290939f8a8864497Af3BC83728715265FF';

const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;

let executor: any;
let provider: BaseProvider;
let abiCoder: utils.AbiCoder;
let eventsLib: any;
let sf: Framework;

let t0: number;
let ops: IOps;
let erc777: IERC777;
let tokenContract: ERC20;

let superPoolBalance: number;
let user1Balance: BigNumber;
let user2Balance: BigNumber;
let user3Balance: BigNumber;
let user4Balance: BigNumber;

let superTokenResolver;

let pools: { [key: number]: IPOOL_RESULT } = {};

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

let ONE_DAY = 24 * 3600 * 30;
const processDir = process.cwd();
let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];

describe.only('V1 Outstream snd Cancel', function () {
  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: `https://goerli.infura.io/v3/1e43f3d31eea4244bf25ed4c13bfde0e`,
            blockNumber: 7755313,
          },
        },
      ],
    });

    [deployer, user1, user2, user3, user4] = await initEnv(hre);

    abiCoder = new utils.AbiCoder();

    provider = hre.ethers.provider;

   
    let poolImpl = await new PoolV1__factory(deployer).deploy();
    console.log('Pool Impl---> deployed');

    let poolInternalImpl = await new PoolInternalV1__factory(deployer).deploy();
    console.log('PoolInternal ---> deployed');

    poolStrategy = await new PoolStrategyV1__factory(deployer).deploy();
    console.log('Pool Strategy---> deployed');

      //// DEPLOY SuperPoolFactory
  let factoryInit: SuperPoolFactoryInitializerStruct = {
    host:network_params.host,
    poolImpl: poolImpl.address,
    poolInternalImpl: poolInternalImpl.address,
    ops: network_params.ops

  }

    
    superPoolFactory = await new SuperPoolFactory__factory(deployer).deploy();

    await superPoolFactory.initialize(factoryInit);

    console.log('Super Pool Factory---> deployed');

    eventsLib = await new Events__factory(deployer).deploy();

    let aaveERC20: IERC20 = await IERC20__factory.connect(network_params.aToken, deployer);

    superTokenContract = await ISuperToken__factory.connect(network_params.superToken, deployer);
    superTokenERC777 = await IERC777__factory.connect(network_params.superToken, deployer);
    tokenContract = new hre.ethers.Contract(network_params.token, abi_erc20mint, deployer) as ERC20;

 

    let superInputStruct: CreatePoolInputStruct = {
    superToken: network_params.superToken,
      poolStrategy: poolStrategy.address
    };

    await superPoolFactory.createSuperPool(superInputStruct);
    console.log('SuperPool ---> created');
    
    let poolRecord = await superPoolFactory.getRecordBySuperTokenAddress(network_params.superToken,poolStrategy.address)

    let poolProxyAddress = poolRecord.pool;
    let poolInternalProxyAddress = poolRecord.poolInternal;

    superPoolAddress = poolProxyAddress;
    // await poolInternal.initialize(settings.address);
    // console.log('Pool Internal ---> initialized');

      await poolStrategy.initialize(
      network_params.ops,
      network_params.superToken,
      network_params.token,
      poolProxyAddress,
      aavePool,
      aToken,
      network_params.aaveToken,
      poolInternalProxyAddress
    );
    console.log('Pool Strategy ---> initialized');

    superPool = PoolV1__factory.connect(superPoolAddress, deployer);
    poolInternal = PoolInternalV1__factory.connect(poolInternalProxyAddress, deployer); 

    let initialPoolEth = hre.ethers.utils.parseEther('10');

    await deployer.sendTransaction({ to: superPoolAddress, value: initialPoolEth });

    superTokenContract.approve(superPoolAddress, hre.ethers.constants.MaxUint256);

    ops = IOps__factory.connect(network_params.ops, deployer);

    /// let balance
    let balance_deployer = await superTokenERC777.balanceOf(deployer.address);

    await faucet(deployer, tokenContract, superTokenContract);

    balance_deployer = await superTokenERC777.balanceOf(deployer.address);

    /////// INITIAL POOL BALANCE /////////
    initialBalance = utils.parseEther('1000');

    // await superTokenContract.transfer(superPoolAddress, initialBalance);

    await faucet(deployer, tokenContract, superTokenContract);

    await faucet(user1, tokenContract, superTokenContract);

    await faucet(user2, tokenContract, superTokenContract);

    let balance = await tokenContract.balanceOf(superPoolAddress);

    //throw new Error("");

    t0 = +(await superPool.getLastTimestamp());

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [network_params.opsExec],
    });

    executor = await hre.ethers.provider.getSigner(network_params.opsExec);

    PRECISSION = await superPool.getPrecission();

    contractsTest = {
      poolAddress: superPoolAddress,
      superTokenContract: superTokenContract,
      superPool: superPool,
      superTokenERC777,
      aaveERC20,
      poolInternal,
      strategyAddresse: poolStrategy.address,
      ops: ops,
      PRECISSION,
    };

    sf = await Framework.create({
      chainId: 31337,
      provider: provider,
      customSubgraphQueriesEndpoint: 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-goerli',
      resolverAddress: network_params.sfResolver,
    });
  });

  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //

    t0 = +(await superPool.getLastTimestamp());
    console.log(t0.toString());

    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 800 units at t0 ');

    let iintUser1 = await superTokenContract.balanceOf(user1.address);

    erc777 = await IERC777__factory.connect(network_params.superToken, user1);

    let amount = utils.parseEther('800');

    await erc777.send(superPoolAddress, amount, '0x');

    let t1 = await superPool.getLastTimestamp();

    let result: [IUSERS_TEST, IPOOL_RESULT];

    let expedtedPoolBalance = amount;

    let poolExpected1: IPOOL_RESULT = {
      id: BigNumber.from(1),
      timestamp: t1,
      poolTotalBalance: expedtedPoolBalance,
      deposit: amount.mul(PRECISSION),
      depositFromInFlowRate: BigNumber.from(0),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      outFlowBuffer: BigNumber.from(0),
      yieldTokenIndex: BigNumber.from(0),
      yieldInFlowRateIndex: BigNumber.from(0),
      yieldAccrued: BigNumber.from(0),
      yieldSnapshot: BigNumber.from(0),
      totalYield: BigNumber.from(0),
      apy: BigNumber.from(0),
      apySpan: t1.sub(BigNumber.from(t0)),
    };

    pools[+poolExpected1.timestamp] = poolExpected1;

    let usersPool: { [key: string]: IUSERTEST } = {
      [user1.address]: {
        name: 'User1',
        address: user1.address,
        expected: {
          id: BigNumber.from(1),
          realTimeBalance: amount,
          tokenBalance: iintUser1.sub(amount),
          deposit: amount.mul(PRECISSION),
          outFlow: BigNumber.from(0),
          outStepAmount:BigNumber.from(0),
          outStepTime: BigNumber.from(0),
          outStreamInit:BigNumber.from(0),
          outMinBalance: BigNumber.from(0),
          outStreamCreated: BigNumber.from(0),
          outStreamId: '0x0000000000000000000000000000000000000000000000000000000000000000',
          nextExecOut: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          inFlowDeposit: BigNumber.from(0),
          timestamp: BigNumber.from(t1),
        },
      },
    };

    await testPeriod(BigNumber.from(t0), +t1 - t0, poolExpected1, contractsTest, usersPool);

    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tests passed ');

    // #endregion ============== FIRST PERIOD ============================= //

    // #region ================= SECOND PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#2--- deposit into strategy gelato to aave');

    let balance = await superTokenContract.realtimeBalanceOfNow(superPoolAddress);

    await setNextBlockTimestamp(hre, +t1 + ONE_DAY);
    let timestamp = t1.add(BigNumber.from(ONE_DAY));

    let lastPool: IPOOL_RESULT = poolExpected1;

    await gelatoPushToAave(poolStrategy, ops, executor);

    let pool = lastPool;
    pool.yieldSnapshot = pool.yieldSnapshot.add(balance.availableBalance);
    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');

    // #endregion ================= SECOND PERIOD ============================= //


    // #region ================= THIRD PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#3--- User2 redeemFlow');

    await setNextBlockTimestamp(hre, +t1 + 2 * ONE_DAY);
    timestamp = t1.add(BigNumber.from(2 * ONE_DAY));
    let flowRate = utils.parseEther('100').div(ONE_DAY);
    let outFlowRate = flowRate.div(BigNumber.from(2));
    await waitForTx(superPool.connect(user1).redeemFlow(outFlowRate));



    let yieldPool = await superPool.getLastPool();

   let  yieldSnapshot = await yieldPool.yieldSnapshot;

    let yieldAccrued = yieldPool.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    loanStream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user1.address,
      providerOrSigner: user1,
    });

    pool.poolTotalBalance =  pool.poolTotalBalance.sub(loanStream.deposit);

   let payload = abiCoder.encode(['int96'], [outFlowRate]);

   let lastUsersPool = usersPool;
  

    result = await applyUserEvent(
      SupplierEvent.OUT_STREAM_START,
      user1.address,
      payload,
      lastUsersPool,
      pool,
      lastPool,
      pools,
      PRECISSION,
      sf,
      network_params.superToken,
      deployer,
      superPoolAddress
    );

    pools[+timestamp] = result[1];
    usersPool = result[0];

    let taskId = await getGelatoWithdrawStepId(superPool,poolInternal,+timestamp,+usersPool[user1.address].expected.outStepTime, user1.address)
    usersPool[user1.address].expected.outStreamId = taskId;
    await testPeriod(BigNumber.from(t0), +t1 + 2 * ONE_DAY, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', '#3--- Period Tests passed ');
    // #endregion =================   THIRD PERIOD ============================= //


  
    // #region =================  FOURTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#4--- User2 provide withdraw  more than allowed');

    console.log( usersPool[user1.address].expected.outMinBalance.toString())
    console.log( usersPool[user1.address].expected.realTimeBalance.toString())
    


    await setNextBlockTimestamp(hre, +t1 + 3 * ONE_DAY);
    timestamp = t1.add(BigNumber.from(3 * ONE_DAY));

    let depositAvailable = usersPool[user1.address].expected.realTimeBalance.sub( usersPool[user1.address].expected.outMinBalance)

    let withdrawAmount = depositAvailable.add(usersPool[user1.address].expected.outMinBalance.div(2))

    await  expect(waitForTx( superPool.connect(user1).redeemDeposit(withdrawAmount))).to.be.revertedWith('NOT_ENOUGH_BALANCE:WITH_OUTFLOW');

   // await waitForTx(superPool.poolUpdateUser(user2.address) )

    // lastPool = Object.assign({}, pool);

    // yieldPool = await superPool.getLastPool();


  

    // yieldSnapshot = await yieldPool.yieldSnapshot;
    // yieldAccrued = yieldPool.yieldAccrued;
    // pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    // payload = abiCoder.encode(['uint256'], [withdrawAmount]);

    // lastUsersPool = usersPool;
    // expedtedPoolBalance = initialBalance.add(amount);

    // result = await applyUserEvent(
    //   SupplierEvent.WITHDRAW,
    //   user2.address,
    //   payload,
    //   lastUsersPool,
    //   pool,
    //   lastPool,
    //   pools,
    //   PRECISSION,
    //   sf,
    //   network_params.superToken,
    //   deployer,
    //   superPoolAddress
    // );

    // pools[+timestamp] = result[1];
    // usersPool = result[0];

    // await testPeriod(BigNumber.from(t0), +t1 + 3 * ONE_DAY, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    // #endregion =================   FOURTH PERIOD ============================= //


    
      for (let i=0; i<30;i++) {
        if (usersPool[user1.address].expected.outStreamId == "0x0000000000000000000000000000000000000000000000000000000000000000"){
          return
        }

        // #region ================= 5th  PERIOD ============================= //
        console.log('\x1b[36m%s\x1b[0m', `#${5+ i }--- gelto withdfraw ${i+1} step`);

        let incrementTime =  +usersPool[user1.address].expected.nextExecOut;

        await setNextBlockTimestamp(hre,  incrementTime);
        timestamp = usersPool[user1.address].expected.nextExecOut; //t1.add(BigNumber.from(7 * ONE_DAY + +usersPool[user1.address].expected.nextExecOut));
    
  
        await gelatoWithdrawStep(poolInternal,gelatoTasks,ops,executor,user1.address,+usersPool[user1.address].expected.outStreamCreated ,+usersPool[user1.address].expected.outStepTime);

    
        lastPool = Object.assign({}, pool);
    
        yieldPool = await superPool.getLastPool();
    
        yieldSnapshot = await yieldPool.yieldSnapshot;
        yieldAccrued = yieldPool.yieldAccrued;
    
        let pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);
    
        pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);
    
        //let pushio = BigNumber.from('0x' + (99999999999999360000).toString(16));
    
        payload = "" //abiCoder.encode(['uint256'], [pushio]);
    
        lastUsersPool = usersPool;
     
        result = await applyUserEvent(
          SupplierEvent.WITHDRAW_STEP,
          user1.address,
          payload,
          lastUsersPool,
          pool,
          lastPool,
          pools,
          PRECISSION,
          sf,
          network_params.superToken,
          deployer,
          superPoolAddress
        );
    
        pools[+timestamp] = result[1];
        usersPool = result[0];
    
        await testPeriod(BigNumber.from(t0), +incrementTime , result[1], contractsTest, result[0]);
    
 
 
 
        console.log('\x1b[36m%s\x1b[0m',  `#${5+ i }-- Period Tests passed `);
        // #endregion =================  SIXTH PERIOD ============================= //
    




        
      }

  });
});
