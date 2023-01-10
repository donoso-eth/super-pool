import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { initEnv, mineBlocks, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { expect } from 'chai';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { ERC20, ERC20__factory, IERC777, IERC777__factory, Events__factory, IOps, IOps__factory, ISuperfluidToken, ISuperfluidToken__factory, ISuperToken, ISuperToken__factory, IERC20, IERC20__factory } from '../typechain-types';

import { constants, Contract, utils } from 'ethers';
import { addUser, fromBnToNumber, getPool, getTimestamp, increaseBlockTime, matchEvent, printPoolResult, printUser, testPeriod } from './helpers/utils-V1';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { concatMap, from } from 'rxjs';
import { ethers } from 'hardhat';

import { ensureDirSync, readFileSync, removeSync } from 'fs-extra';
import { INETWORK_CONFIG } from 'hardhat/helpers/models';
import { join } from 'path';
import { applyUserEvent, faucet, updatePool } from './helpers/logic-V1';
import { ICONTRACTS_TEST, IPOOL_RESULT, IUSERS_TEST, IUSERTEST, SupplierEvent } from './helpers/models-V1';


import {  getGelatoCloStreamId} from './helpers/gelato-V1';

import { BigNumber } from '@ethersproject/bignumber';
import { CreatePoolInputStruct, SuperPoolFactory, SuperPoolFactoryInitializerStruct } from '../typechain-types/SuperPoolFactory';
import { PoolV1 } from '../typechain-types/PoolV1';
import { PoolStrategyV1 } from '../typechain-types/PoolStrategyV1';
import { PoolInternalV1 } from '../typechain-types/PoolInternalV1';
import { PoolInternalV1__factory } from '../typechain-types/factories/PoolInternalV1__factory';
import { PoolStrategyV1__factory } from '../typechain-types/factories/PoolStrategyV1__factory';
import { PoolV1__factory } from '../typechain-types/factories/PoolV1__factory';
import { SuperPoolFactory__factory } from '../typechain-types/factories/SuperPoolFactory__factory';

import * as dotenv from 'dotenv';

let superPoolFactory: SuperPoolFactory;
let poolFactory: PoolV1;

let poolStrategy: PoolStrategyV1;

let poolInternalImpl: PoolInternalV1;

let superPool: PoolV1;
let superPoolAddress: string;

let superTokenContract: ISuperToken;

let superTokenERC777: IERC777;
let contractsTest: ICONTRACTS_TEST;



const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;

let whale:any;

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

dotenv.config();

const INFURA_ID = 'YOUR KEY'; //process.env["INFURA_ID"]
const MORALIS_ID = 'YOUR KEY'; //process.env["MORALIS_ID"]
const ALCHEMY_ID_POLYGON = process.env["ALCHEMY_ID_POLYGON"]

let ONE_MONTH = 24 * 3600 * 30;
const processDir = process.cwd();
let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['polygon'];
removeSync(join(processDir,'expected','accounting'));
ensureDirSync(join(processDir,'expected','accounting'));

describe.only('V1 TEST ACCOUNTING', function () {
  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl:  `https://polygon-mainnet.g.alchemy.com/v2/${ALCHEMY_ID_POLYGON}`, //
          },
        },
      ],
    });

    [deployer, user1, user2, user3, user4] = await initEnv(hre);

    abiCoder = new utils.AbiCoder();

    provider = hre.ethers.provider;

    let poolImpl = await new PoolV1__factory(deployer).deploy();
    console.log('Pool Impl---> deployed');

    poolInternalImpl = await new PoolInternalV1__factory(deployer).deploy();
    console.log('PoolInternal ---> deployed');

   // await poolInternalImpl.initialize()

    poolStrategy = await new PoolStrategyV1__factory(deployer).deploy();
    console.log('Pool Strategy---> deployed');

    //// DEPLOY SuperPoolFactory
    let factoryInit: SuperPoolFactoryInitializerStruct = {
      host: network_params.host,
      poolImpl: poolImpl.address,
      poolInternalImpl: poolInternalImpl.address,
      ops: network_params.ops,
    };

    superPoolFactory = await new SuperPoolFactory__factory(deployer).deploy();

    await superPoolFactory.initialize(factoryInit);

    let supefluidOwner = "0x1EB3FAA360bF1f093F5A18d21f21f13D769d044A";
    //supefluidOwner  = "0x5eb449B88Ff8f03cD0C736A72ac70B76258E4B10"

    let governanceAddress = "0x3AD3f7A0965Ce6f9358AD5CCE86Bc2b05F1EE087"

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [supefluidOwner],
    });

    executor = await hre.ethers.provider.getSigner(supefluidOwner);


    let abiAuthApp:any[] = ["function authorizeAppFactory(address,address) external",
     "function isAuthorizedAppFactory(address,address) external view returns (bool)"
 ];

    let governanceContract = new Contract(governanceAddress,abiAuthApp,executor)
   
  let result = await governanceContract.isAuthorizedAppFactory(network_params.host,superPoolFactory.address);
  console.log(174,result);

    await governanceContract.authorizeAppFactory(network_params.host,superPoolFactory.address);
    
    result = await governanceContract.isAuthorizedAppFactory(network_params.host,superPoolFactory.address);
  console.log(179,result);
    console.log('Super Pool Factory---> deployed');

    eventsLib = await new Events__factory(deployer).deploy();




    let aaveERC20: IERC20 = await IERC20__factory.connect(network_params.aToken, deployer);

    superTokenContract = await ISuperToken__factory.connect(network_params.superToken, deployer);
    superTokenERC777 = await IERC777__factory.connect(network_params.superToken, deployer);
    tokenContract =   await IERC20__factory.connect(network_params.token, deployer) as ERC20;

    let superInputStruct: CreatePoolInputStruct = {
      superToken: network_params.superToken,
      poolStrategy: poolStrategy.address,
    };

    await superPoolFactory.createSuperPool(superInputStruct);
    console.log('SuperPool ---> created');

    let poolRecord = await superPoolFactory.getRecordBySuperTokenAddress(network_params.superToken, poolStrategy.address);

    let poolProxyAddress = poolRecord.pool;
    let poolInternalProxyAddress = poolRecord.poolInternal;

    superPoolAddress = poolProxyAddress;
    // await poolInternal.initialize(settings.address);
    // console.log('Pool Internal ---> initialized');

    await poolStrategy.initialize( network_params.superToken, network_params.token, poolProxyAddress, network_params.aavePool, network_params.aToken);
    console.log('Pool Strategy ---> initialized');

    superPool = PoolV1__factory.connect(superPoolAddress, deployer);
   // poolInternal = PoolInternalV1__factory.connect(poolInternalProxyAddress, deployer);

    let initialPoolEth = hre.ethers.utils.parseEther('10');

    await deployer.sendTransaction({ to: superPoolAddress, value: initialPoolEth });

    let superTokenWhale = "0x2dbd50a4ef9b172698596217b7db0163d3607b41"
    superTokenWhale = "0xf31227006e2a9490ac5868ba818f21ac21c66a82";
    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [superTokenWhale],
    });

   whale= await hre.ethers.provider.getSigner(superTokenWhale);
   let walle_deployer = await superTokenERC777.balanceOf(superTokenWhale);
   console.log(231,ethers.utils.formatEther(walle_deployer))

    superTokenContract.approve(superPoolAddress, hre.ethers.constants.MaxUint256);

    ops = IOps__factory.connect(network_params.ops, deployer);

    /// let balance
    let balance_deployer = await superTokenERC777.balanceOf(deployer.address);

    console.log(239,balance_deployer);

    await faucet(deployer, tokenContract, superTokenContract,whale);

    balance_deployer = await superTokenERC777.balanceOf(deployer.address);

    console.log(245,balance_deployer);

    /////// INITIAL POOL BALANCE /////////
    initialBalance = utils.parseEther('1000');

    // await superTokenContract.transfer(superPoolAddress, initialBalance);

    await faucet(deployer, tokenContract, superTokenContract,whale);

    await faucet(user1, tokenContract, superTokenContract,whale);

    await faucet(user2, tokenContract, superTokenContract,whale);

    await faucet(user3, tokenContract, superTokenContract,whale);

    let balance = await tokenContract.balanceOf(superPoolAddress);

    //throw new Error("");

    t0 = +(await superPool.getLastTimestamp());

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [network_params.opsExec],
    });

    executor = await hre.ethers.provider.getSigner(network_params.opsExec);

    PRECISSION = BigNumber.from(1000000);

    contractsTest = {
      poolAddress: superPoolAddress,
      superTokenContract: superTokenContract,
      superPool: superPool,
      superTokenERC777,
      aaveERC20,
      strategyAddresse: poolStrategy.address,
      ops: ops,
      PRECISSION,
    };

    sf = await Framework.create({
      chainId: 1337,
      provider: provider,
      customSubgraphQueriesEndpoint: 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-goerli',
      resolverAddress: network_params.sfResolver,
    });
  });
  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //

    t0 = +(await superPool.getLastTimestamp());
    console.log(t0.toString());

    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 500 units at t0 ');

    let iintUser1 = await superTokenContract.balanceOf(user1.address);
    console.log(iintUser1.toString());

    erc777 = await IERC777__factory.connect(network_params.superToken, user1);

    let amount = utils.parseEther('500');

    await erc777.send(superPoolAddress, amount, '0x');

    let t1 = await superPool.getLastTimestamp();

    let result: [IUSERS_TEST, IPOOL_RESULT];

    let expedtedPoolBalance = initialBalance.add(amount);

    let poolExpected1: IPOOL_RESULT = {
      id: BigNumber.from(1),
      timestamp: t1,
      poolTotalBalance: amount,
      poolBalance: BigNumber.from(0),
      aaveBalance: amount.div(10 ** 12),
      protocolYield: BigNumber.from(0),
      deposit: amount.mul(PRECISSION),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(0),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      outFlowBuffer: BigNumber.from(0),
      yieldTokenIndex: BigNumber.from(0),
      yieldInFlowRateIndex: BigNumber.from(0),
      yieldOutFlowRateIndex: BigNumber.from(0),
      yieldAccrued: BigNumber.from(0),
      yieldSnapshot: utils.parseEther('500'),
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
          outStepAmount: BigNumber.from(0),
          outStepTime: BigNumber.from(0),
          outStreamCreated: BigNumber.from(0),
          outStreamInit: BigNumber.from(0),
          outMinBalance: BigNumber.from(0),
          outStreamId: '0x0000000000000000000000000000000000000000000000000000000000000000',
          nextExecOut: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          inFlowDeposit: BigNumber.from(0),
          timestamp: BigNumber.from(t1),
        },
      },
    };

    await testPeriod(BigNumber.from(t0), +t1 - t0, poolExpected1, contractsTest, usersPool,'accounting');

    let yieldPool;
    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tests passed ');

    // #endregion ============== FIRST PERIOD ============================= //

    // #region =================  SECOND PERIOD ============================= //

    await setNextBlockTimestamp(hre, +t1 + 2 * ONE_MONTH);
    let timestamp = t1.add(BigNumber.from(2 * ONE_MONTH));
    console.log('\x1b[36m%s\x1b[0m', '#2--- User2 provides starts a stream 100 tokens/month');

    let flowRate = utils.parseEther('100').div(ONE_MONTH);

    let createFlowOperation = sf.cfaV1.createFlow({
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

    yieldPool = await superPool.getLastPool();

    let yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    let yieldAccrued = await yieldPool.yieldObject.yieldAccrued;

    let lastPool: IPOOL_RESULT = poolExpected1;

    let lastUsersPool: IUSERS_TEST = usersPool;

    let pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    pool.aaveBalance = pool.aaveBalance.add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );

    let payload = abiCoder.encode(['int96'], [flowRate]);

    if (lastUsersPool[user2.address] == undefined) {
      lastUsersPool[user2.address] = addUser(user2.address, 2, timestamp);
    } 

    result = await applyUserEvent(SupplierEvent.STREAM_START, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    await testPeriod(BigNumber.from(t0), +t1 + ONE_MONTH * 2, result[1], contractsTest, result[0],'accounting');
    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');

    // #endregion ================= SECOND PERIOD ============================= //

    // #region ================= THIRD PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#3--- User2 provides sends 300 at t0 + 3*  One Day ');

    await setNextBlockTimestamp(hre, +t1 + 4 * ONE_MONTH);
    timestamp = t1.add(BigNumber.from(4 * ONE_MONTH));
    erc777 = await IERC777__factory.connect(network_params.superToken, user2);
    amount = utils.parseEther('300');
    await waitForTx(erc777.send(superPoolAddress, amount, '0x'));

    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;

    let currentsnap = yieldSnapshot.sub(amount).sub(flowRate.mul(2 * ONE_MONTH));

    pool = updatePool(lastPool, timestamp, yieldAccrued, currentsnap, PRECISSION);

    pool.aaveBalance = pool.aaveBalance.add(amount.add(flowRate.mul(2 * ONE_MONTH)).div(10 ** 12)).add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );
    pool.yieldSnapshot = pool.yieldSnapshot.add(amount.add(flowRate.mul(2 * ONE_MONTH)));

    payload = abiCoder.encode(['uint256'], [amount]);

    lastUsersPool = usersPool;

    result = await applyUserEvent(SupplierEvent.DEPOSIT, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);

    pools[+timestamp] = result[1];
    usersPool = result[0];

    await testPeriod(BigNumber.from(t0), +t1 + 4 * ONE_MONTH, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#3--- Period Tests passed ');
    // #endregion =================   THIRD PERIOD ============================= //

    // #region =================  FOURTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#4--- User1 Withdaw 150');

    await setNextBlockTimestamp(hre, +t1 + 5 * ONE_MONTH);
    timestamp = t1.add(BigNumber.from(5 * ONE_MONTH));

    amount = utils.parseEther('150');
    await waitForTx(superPool.connect(user1).redeemDeposit(amount));

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.add(utils.parseEther('50')), PRECISSION);

    payload = abiCoder.encode(['uint256'], [amount]);

    lastUsersPool = usersPool;
    expedtedPoolBalance = initialBalance.add(amount);

    pool.aaveBalance = pool.aaveBalance.sub(utils.parseEther('50').div(10 ** 12)).add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );
    pool.yieldSnapshot = pool.yieldSnapshot.sub(utils.parseEther('50'));

    result = await applyUserEvent(SupplierEvent.WITHDRAW, user1.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);

    pools[+timestamp] = result[1];
    usersPool = result[0];

    await testPeriod(BigNumber.from(t0), +t1 + 5 * ONE_MONTH, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    // #endregion =================   FOUR PERIOD ============================= //

    // #region =================  FIVE PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#5--- User2 streamstop');

    await setNextBlockTimestamp(hre, +t1 + 6 * ONE_MONTH);
    timestamp = t1.add(BigNumber.from(6 * ONE_MONTH));

    let deleteFlowOperation = sf.cfaV1.deleteFlow({
      receiver: superPoolAddress,
      sender: user2.address,
      superToken: network_params.superToken,
    });
    let tx = await deleteFlowOperation.exec(user2);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    yieldSnapshot = yieldSnapshot.sub(flowRate.mul(ONE_MONTH));
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    payload = abiCoder.encode(['int96'], [usersPool[user2.address].expected.inFlow]);

    lastUsersPool = usersPool;

    result = await applyUserEvent(SupplierEvent.STREAM_STOP, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);

    pools[+timestamp] = result[1];
    usersPool = result[0];

    pool.yieldSnapshot = pool.yieldSnapshot.add(flowRate.mul(ONE_MONTH));
    pool.aaveBalance = pool.aaveBalance.add(flowRate.mul(ONE_MONTH).div(10 ** 12)).add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );

    await testPeriod(BigNumber.from(t0), +t1 + 6 * ONE_MONTH, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#5--- Period Tests passed ');
    // #endregion =================   FIVETH PERIOD ============================= //

    // #region =================  SIXTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#6--- User1 Start Stream');

    await setNextBlockTimestamp(hre, +t1 + 7 * ONE_MONTH);
    timestamp = t1.add(BigNumber.from(7 * ONE_MONTH));

    flowRate = flowRate.div(BigNumber.from(2));

    createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolAddress,
      flowRate: flowRate.toString(),
      superToken: network_params.superToken,
    });
    await createFlowOperation.exec(user1);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    pool.aaveBalance = pool.aaveBalance.add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );

    payload = abiCoder.encode(['int96'], [flowRate]);

    lastUsersPool = usersPool;

    result = await applyUserEvent(SupplierEvent.STREAM_START, user1.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);

    pools[+timestamp] = result[1];
    usersPool = result[0];

    await testPeriod(BigNumber.from(t0), +t1 + 7 * ONE_MONTH, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#6--- Period Tests passed ');
    // #endregion =================   END 6TH PERIOD ============================= //

    // #region =================  7th PERIOD ============================= //
    timestamp = timestamp.add(BigNumber.from(ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

    console.log('\x1b[36m%s\x1b[0m', '#7--- User2 redeem flow');

    flowRate = utils.parseEther('50').div(ONE_MONTH);
    await waitForTx(superPool.connect(user2).redeemFlow(flowRate));

      

    loanStream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });

    let initialWidthraw = BigNumber.from(5 * 3600).mul(flowRate);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool.poolTotalBalance = pool.poolTotalBalance.sub(loanStream.deposit);
    yieldSnapshot = yieldSnapshot.sub(flowRate.mul(ONE_MONTH)).add(initialWidthraw);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate]);
    lastUsersPool = usersPool;

    pool.poolBalance = pool.poolBalance.add(initialWidthraw);

    pool.aaveBalance = pool.aaveBalance
      .add(
        flowRate
          .mul(ONE_MONTH)
          .sub(initialWidthraw)
          .div(10 ** 12)
      )
      .add(
        yieldAccrued
          .mul(100)
          .div(97)
          .div(10 ** 12)
      );


    result = await applyUserEvent(SupplierEvent.OUT_STREAM_START, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];
    let taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;
    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#7--- Period Tests passed ');
    // #endregion ================= END 7TH PERIOD ============================= //



        

    // #region =================  8th PERIOD ============================= //
    timestamp = timestamp.add(BigNumber.from(ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

    console.log('\x1b[36m%s\x1b[0m', '#8--- User2 stop reddem flow ');

    await waitForTx(superPool.connect(user2).redeemFlowStop());

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate]);
    lastUsersPool = usersPool;

    pool.poolBalance = pool.poolBalance.sub(initialWidthraw);

    pool.aaveBalance = pool.aaveBalance.add(initialWidthraw.div(10 ** 12)).add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );
    pool.yieldSnapshot = pool.yieldSnapshot.sub(initialWidthraw);

    result = await applyUserEvent(SupplierEvent.OUT_STREAM_STOP, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];
    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'accounting');
    console.log('\x1b[36m%s\x1b[0m', '#8--- Period Tests passed ');
    // #endregion ================= EIGTH PERIOD ============================= //

    // #region =================  9th PERIOD ============================= //
    timestamp = timestamp.add(BigNumber.from(ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

    console.log('\x1b[36m%s\x1b[0m', '#9--- User1 transfer 75 to user3 ');

    let transferAmount = utils.parseEther('75');

    await waitForTx(superPool.connect(user2).transfer(user3.address, transferAmount));

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['address', 'uint256'], [user3.address, transferAmount]);

    lastUsersPool = usersPool;

    if (lastUsersPool[user3.address] == undefined) {
      lastUsersPool[user3.address] = addUser(user3.address, 3, timestamp);
    }

    pool.aaveBalance = pool.aaveBalance.add(flowRate.mul(ONE_MONTH).div(10 ** 12)).add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );

    result = await applyUserEvent(SupplierEvent.TRANSFER, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];
    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#9--- Period Tests passed ');

    // #endregion ================= 9th PERIOD ============================= //

    // #region =================  10th PERIOD ============================= //
    timestamp = timestamp.add(BigNumber.from(ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

    console.log('\x1b[36m%s\x1b[0m', '#10--- User3 start stream in');

    let flowRate2 = utils.parseEther('90').div(ONE_MONTH);

    createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolAddress,
      flowRate: flowRate2.toString(),
      superToken: network_params.superToken,
    });
    await createFlowOperation.exec(user3);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate2]);

    lastUsersPool = usersPool;
    pool.aaveBalance = pool.aaveBalance.add(flowRate.mul(ONE_MONTH).div(10 ** 12)).add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );

    result = await applyUserEvent(SupplierEvent.STREAM_START, user3.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];
    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#10--- Period Tests passed ');

    // #endregion ================= 10TH PERIOD ============================= //

    // #region =================  11th PERIOD ============================= //
    timestamp = timestamp.add(BigNumber.from(ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

    console.log('\x1b[36m%s\x1b[0m', '#11--- User1 redeemflow');

    let flowRateOut = utils.parseEther('45').div(ONE_MONTH);

    await waitForTx(superPool.connect(user1).redeemFlow(flowRateOut));

    initialWidthraw = BigNumber.from(5 * 3600).mul(flowRateOut);

    yieldPool = await superPool.getLastPool();
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRateOut]);

    lastUsersPool = usersPool;

    pool.aaveBalance = pool.aaveBalance
      .add(
        flowRate
          .add(flowRate2)
          .mul(ONE_MONTH)
          .div(10 ** 12)
      )
      .add(
        yieldAccrued
          .mul(100)
          .div(97)
          .div(10 ** 12)
      )
      .sub(initialWidthraw.div(10 ** 12));
    pool.poolBalance = pool.poolBalance.add(initialWidthraw);

    result = await applyUserEvent(SupplierEvent.OUT_STREAM_START, user1.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user1.address].expected.outStepTime, user1.address);
    usersPool[user1.address].expected.outStreamId = taskId;

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#11--- Period Tests passed ');

    // #endregion ================= 11th PERIOD ============================= //

    // #region =================  12th PERIOD ============================= //
    timestamp = timestamp.add(BigNumber.from(ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

    console.log('\x1b[36m%s\x1b[0m', '#12--- User2 redeemflow');

    let flowRateOut2 = utils.parseEther('45').div(ONE_MONTH);

    await waitForTx(superPool.connect(user2).redeemFlow(flowRateOut2));

    let initialWidthraw2 = BigNumber.from(5 * 3600).mul(flowRateOut2);

    yieldPool = await superPool.getLastPool();
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRateOut2]);

    lastUsersPool = usersPool;

    pool.aaveBalance = pool.aaveBalance
      .add(flowRate2.mul(ONE_MONTH).div(10 ** 12))
      .add(
        yieldAccrued
          .mul(100)
          .div(97)
          .div(10 ** 12)
      )
      .sub(initialWidthraw2.div(10 ** 12));
    pool.poolBalance = pool.poolBalance.add(initialWidthraw2);

    result = await applyUserEvent(SupplierEvent.OUT_STREAM_START, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'accounting');

    console.log('\x1b[36m%s\x1b[0m', '#12--- Period Tests passed ');

    // #endregion ================= 12th PERIOD ============================= //

  });
});
