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
  GelatoTasksV2,
  GelatoTasksV2__factory,
  IOps,
  IOps__factory,
  ISuperfluidToken,
  ISuperfluidToken__factory,
  ISuperToken,
  ISuperToken__factory,
  PoolFactoryV2,
  PoolFactoryV2__factory,
  PoolInternalV2,
  PoolInternalV2__factory,
  PoolStrategyV2,
  PoolStrategyV2__factory,
  ResolverSettingsV2,
  ResolverSettingsV2__factory,
  STokenFactoryV2,
  STokenFactoryV2__factory,
  SuperPoolHost,
  SuperPoolHost__factory,
  IERC20,
  IERC20__factory,
} from '../typechain-types';

import { constants, utils } from 'ethers';
import { addUser, fromBnToNumber, getPool, getTimestamp, increaseBlockTime, matchEvent, printPeriod, printPoolResult, printUser, testPeriod } from './helpers/utils-V2';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { ResolverSettingsInitilizerStruct, SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';
import { concatMap, from } from 'rxjs';
import { ethers } from 'hardhat';

import { readFileSync } from 'fs-extra';
import { INETWORK_CONFIG } from 'hardhat/helpers/models';
import { join } from 'path';
import { applyUserEvent, faucet, updatePool } from './helpers/logic-V2';
import { ICONTRACTS_TEST, IPOOL_RESULT, IUSERS_TEST, IUSERTEST, SupplierEvent } from './helpers/models-V2';

import { abi_erc20mint } from '../helpers/abis/ERC20Mint';
import { gelatoPushToAave, gelatoWithdrawStep, getGelatoWithdrawStepId } from './helpers/gelato-V2';

import { BigNumber } from '@ethersproject/bignumber';

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactoryV2;
let sTokenFactory: STokenFactoryV2;
let gelatoTasks: GelatoTasksV2;
let poolStrategy: PoolStrategyV2;
let settings: ResolverSettingsV2;
let poolInternal: PoolInternalV2;

let superPool: PoolFactoryV2;
let superPoolAddress: string;
let sToken: STokenFactoryV2;
let sTokenAddress: string;

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

describe.only('V2 test OUTSTREAM ONLY', function () {
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

    superPoolHost = await new SuperPoolHost__factory(deployer).deploy(network_params.host);
    console.log('Host---> deployed');
    poolFactory = await new PoolFactoryV2__factory(deployer).deploy();
    console.log('Pool Factory---> deployed: ');
    sTokenFactory = await new STokenFactoryV2__factory(deployer).deploy();
    console.log('Token Factotokery---> deployed');

    //
    gelatoTasks = await new GelatoTasksV2__factory(deployer).deploy();
    console.log('Gelato Resolver---> deployed');

    poolStrategy = await new PoolStrategyV2__factory(deployer).deploy();
    console.log('Pool Strategy---> deployed');

    settings = await new ResolverSettingsV2__factory(deployer).deploy();
    console.log('Settings ---> deployed');

    poolInternal = await new PoolInternalV2__factory(deployer).deploy();
    console.log('PoolInternal ---> deployed');

    eventsLib = await new Events__factory(deployer).deploy();

    let aaveERC20: IERC20 = await IERC20__factory.connect(network_params.aToken, deployer);

    superTokenContract = await ISuperToken__factory.connect(network_params.superToken, deployer);
    superTokenERC777 = await IERC777__factory.connect(network_params.superToken, deployer);
    tokenContract = new hre.ethers.Contract(network_params.token, abi_erc20mint, deployer) as ERC20;

    let resolverInit: ResolverSettingsInitilizerStruct = {
      _poolStrategy: poolStrategy.address,
      _gelatoTaks: gelatoTasks.address,
      _gelatoOps: network_params.ops,
      _poolInternal: poolInternal.address,
    };

    let superInputStruct: SuperPoolInputStruct = {
      poolFactoryImpl: poolFactory.address,
      sTokenImpl: sTokenFactory.address,
      superToken: network_params.superToken,
      token: network_params.token,

      settings: settings.address,
      settingsInitializer: resolverInit,
    };

    await superPoolHost.createSuperPool(superInputStruct);
    console.log('SuperPool ---> created');
    superTokenResolver = await superPoolHost.getResolverBySuperToken(network_params.superToken);

    superPoolAddress = superTokenResolver.pool;
    sTokenAddress = superTokenResolver.sToken;

    await poolInternal.initialize(settings.address);
    console.log('Gelato Tasks ---> initialized');

    await gelatoTasks.initialize(network_params.ops, superPoolAddress);
    console.log('Gelato Tasks ---> initialized');
    await poolStrategy.initialize(network_params.ops, network_params.superToken, network_params.token, superPoolAddress, aavePool, aToken);
    console.log('Pool Strategy ---> initialized');

    superPool = PoolFactoryV2__factory.connect(superPoolAddress, deployer);

    sToken = STokenFactoryV2__factory.connect(sTokenAddress, deployer);

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

    t0 = +(await superPool.lastPoolTimestamp());

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [network_params.opsExec],
    });

    executor = await hre.ethers.provider.getSigner(network_params.opsExec);

    PRECISSION = await settings.getPrecission();

    contractsTest = {
      poolAddress: superPoolAddress,
      superTokenContract: superTokenContract,
      superPool: superPool,
      sToken: sToken,
      superTokenERC777,
      aaveERC20,
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

    t0 = +(await superPool.lastPoolTimestamp());
    console.log(t0.toString());

    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 800 units at t0 ');

    erc777 = await IERC777__factory.connect(network_params.superToken, user2);

    let amount = utils.parseEther('800');

    await erc777.send(superPoolAddress, amount, '0x');

    let t1 = await superPool.lastPoolTimestamp();

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
      [user2.address]: {
        name: 'User2',
        address: user2.address,
        expected: {
          id: BigNumber.from(2),
          realTimeBalance: amount,
          tokenBalance: initialBalance.sub(amount),
          deposit: amount.mul(PRECISSION),
          outFlow: BigNumber.from(0),
          outStepAmount: BigNumber.from(0),
          outStepTime: BigNumber.from(0),
          outStreamInit: BigNumber.from(0),
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
  
    let payload = abiCoder.encode(['uint96'], [balance.availableBalance]);

    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');

    // #endregion ================= SECOND PERIOD ============================= //

    // #region ================= THIRD PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#3--- User2 reddemFlow');

    await setNextBlockTimestamp(hre, +t1 + 2 * ONE_DAY);
    timestamp = t1.add(BigNumber.from(2 * ONE_DAY));
    let flowRate = utils.parseEther('100').div(ONE_DAY);
    let outFlowRate = flowRate.div(BigNumber.from(2));
    await waitForTx(superPool.connect(user2).redeemFlow(outFlowRate, 0));

    let yieldPool = await superPool.getLastPool();

    let yieldSnapshot = await yieldPool.yieldSnapshot;
    let yieldAccrued = yieldPool.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    loanStream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });

    pool.poolTotalBalance = pool.poolTotalBalance.sub(loanStream.deposit);
    payload = abiCoder.encode(['int96'], [outFlowRate]);

    let lastUsersPool = usersPool;
    expedtedPoolBalance = initialBalance.add(amount);

    result = await applyUserEvent(
      SupplierEvent.OUT_STREAM_START,
      user2.address,
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

    let taskId = await getGelatoWithdrawStepId(superPool, gelatoTasks, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;
    await testPeriod(BigNumber.from(t0), +t1 + 2 * ONE_DAY, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', '#3--- Period Tests passed ');
    // #endregion =================   THIRD PERIOD ============================= //

    // #region =================  FOURTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#4--- User2 provides sends 100 at t0 + 3*  One Day ');

    await setNextBlockTimestamp(hre, +t1 + 3 * ONE_DAY);
    await setNextBlockTimestamp(hre, +t1 + 3 * ONE_DAY);
    timestamp = t1.add(BigNumber.from(3 * ONE_DAY));
    erc777 = await IERC777__factory.connect(network_params.superToken, user2);
    amount = utils.parseEther('100');
    await waitForTx(erc777.send(superPoolAddress, amount, '0x'));

    // await waitForTx(superPool.poolUpdateUser(user2.address) )

    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;
    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    payload = abiCoder.encode(['uint256'], [amount]);

    lastUsersPool = usersPool;
    expedtedPoolBalance = initialBalance.add(amount);

    result = await applyUserEvent(
      SupplierEvent.DEPOSIT,
      user2.address,
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

    await testPeriod(BigNumber.from(t0), +t1 + 3 * ONE_DAY, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    // #endregion =================   FOURTH PERIOD ============================= //

    // #region ================= 5th  PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', `#${5}--- gelto withdfraw ${1} step`);

    let incrementTime = +usersPool[user2.address].expected.nextExecOut;

    await setNextBlockTimestamp(hre, incrementTime);
    timestamp = usersPool[user2.address].expected.nextExecOut; //t1.add(BigNumber.from(7 * ONE_DAY + +usersPool[user2.address].expected.nextExecOut));

    await gelatoWithdrawStep(
      superPool,
      gelatoTasks,
      ops,
      executor,
      user2.address,
      +usersPool[user2.address].expected.outStreamCreated,
      +usersPool[user2.address].expected.outStepTime
    );

    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;

    let pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);

    //let pushio = BigNumber.from('0x' + (99999999999999360000).toString(16));

    payload = ''; //abiCoder.encode(['uint256'], [pushio]);

    lastUsersPool = usersPool;

    result = await applyUserEvent(
      SupplierEvent.WITHDRAW_STEP,
      user2.address,
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

    await testPeriod(BigNumber.from(t0), +incrementTime, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', `#${5}-- Period Tests passed `);
    // #endregion =================   FIVE PERIOD ============================= //

    // #region ================= 6th  PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', `#${6}--- update flow to /2`);

    await setNextBlockTimestamp(hre, incrementTime + +ONE_DAY);
    timestamp = BigNumber.from(ONE_DAY).add(BigNumber.from(incrementTime)); //t1.add(BigNumber.from(7 * ONE_DAY + +usersPool[user2.address].expected.nextExecOut));

    outFlowRate = flowRate;
    await waitForTx(superPool.connect(user2).redeemFlow(outFlowRate, 0));

    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;

    pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);

    //let pushio = BigNumber.from('0x' + (99999999999999360000).toString(16));
    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);
    loanStream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });
    pool.poolTotalBalance = pool.poolTotalBalance.sub(loanStream.deposit);
    payload = abiCoder.encode(['int96'], [outFlowRate]);

    lastUsersPool = usersPool;

    result = await applyUserEvent(
      SupplierEvent.OUT_STREAM_UPDATE,
      user2.address,
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
    taskId = await getGelatoWithdrawStepId(superPool, gelatoTasks, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;
    await testPeriod(BigNumber.from(t0), +incrementTime + ONE_DAY, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', `#${6}-- Period Tests passed `);
    // #endregion =================   SIXTB PERIOD ============================= //

    // #region ================= 7th  PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', `#${7}--- update flow to /5`);

    timestamp = timestamp.add(BigNumber.from(100)); //t1.add(BigNumber.from(7 * ONE_DAY + +usersPool[user2.address].expected.nextExecOut));
    await setNextBlockTimestamp(hre, +timestamp);

    outFlowRate = flowRate.div(BigNumber.from(5));
    await waitForTx(superPool.connect(user2).redeemFlow(outFlowRate, 0));

    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;

    pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);

    //let pushio = BigNumber.from('0x' + (99999999999999360000).toString(16));
    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);
    loanStream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });
    pool.poolTotalBalance = pool.poolTotalBalance.sub(loanStream.deposit);
    payload = abiCoder.encode(['int96'], [outFlowRate]);

    lastUsersPool = usersPool;

    result = await applyUserEvent(
      SupplierEvent.OUT_STREAM_UPDATE,
      user2.address,
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
    taskId = await getGelatoWithdrawStepId(superPool, gelatoTasks, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;
    await testPeriod(BigNumber.from(t0), +incrementTime + ONE_DAY, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', `#${7}-- Period Tests passed `);
    // #endregion =================   SEVENTH PERIOD ============================= //

    // #region ================= 8th  PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', `#${8}--- update flow to /5`);

    timestamp = timestamp.add(BigNumber.from(ONE_DAY)); //t1.add(BigNumber.from(7 * ONE_DAY + +usersPool[user2.address].expected.nextExecOut));
    await setNextBlockTimestamp(hre, +timestamp);

    await waitForTx(superPool.connect(user2).redeemFlowStop());

    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;

    pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);

    //let pushio = BigNumber.from('0x' + (99999999999999360000).toString(16));
    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);

    payload = abiCoder.encode(['int96'], [outFlowRate]);

    lastUsersPool = usersPool;

    result = await applyUserEvent(
      SupplierEvent.OUT_STREAM_STOP,
      user2.address,
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

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', `#${8}-- Period Tests passed `);
    // #endregion =================   EIGTH PERIOD ============================= //
  
    // #region ================= 9th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#9--- deposit into strategy gelato to aave');

    balance = await superTokenContract.realtimeBalanceOfNow(superPoolAddress);

   timestamp = timestamp.add(BigNumber.from(ONE_DAY));
    await setNextBlockTimestamp(hre, +timestamp);
    await gelatoPushToAave(poolStrategy, ops, executor);

    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;

    pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);


    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);

     payload = abiCoder.encode(['uint96'], [balance.availableBalance]);

    lastUsersPool = usersPool;
  
    result = await applyUserEvent(
      SupplierEvent.PUSH_TO_STRATEGY,
      constants.AddressZero,
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
    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0]);
    console.log('\x1b[36m%s\x1b[0m', '#9--- Period Tests passed ');

    // #endregion ================= 9th PERIOD ============================= //

  
    // #region ================= 10th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#10---  user1 start stream 100/month');

    balance = await superTokenContract.realtimeBalanceOfNow(superPoolAddress);

   timestamp = timestamp.add(BigNumber.from(ONE_DAY));
    await setNextBlockTimestamp(hre, +timestamp);
   

    let createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolAddress,
      flowRate: flowRate.toString(),
      superToken: network_params.superToken,
    });
    await createFlowOperation.exec(user1);

    fromUser1Stream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: user1.address,
      receiver: superPoolAddress,
      providerOrSigner: user1,
    });


    lastPool = Object.assign({}, pool);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;

    pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);


    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);

     payload = abiCoder.encode(['int96'], [flowRate]);

    lastUsersPool = usersPool;

    if (lastUsersPool[user1.address] == undefined) {
      lastUsersPool[user1.address] = addUser(user1.address, 1, timestamp);
    }

  
    result = await applyUserEvent(
      SupplierEvent.STREAM_START,
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
    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0]);
    console.log('\x1b[36m%s\x1b[0m', '#10--- Period Tests passed ');

    // #endregion ================= 10th PERIOD ============================= //


    // #region ================= 11th PERIOD ============================= //
        console.log('\x1b[36m%s\x1b[0m', '#10---  user1 start stream 100/month');

        balance = await superTokenContract.realtimeBalanceOfNow(superPoolAddress);
    
       timestamp = timestamp.add(BigNumber.from(ONE_DAY));
        await setNextBlockTimestamp(hre, +timestamp);
       
        let transferAmount = utils.parseEther("75")
        sToken.connect(user2).transfer(user1.address,transferAmount)
    
        lastPool = Object.assign({}, pool);
    
        yieldPool = await superPool.getLastPool();
    
        yieldSnapshot = await yieldPool.yieldSnapshot;
        yieldAccrued = yieldPool.yieldAccrued;
    
        pushio = yieldSnapshot.sub(lastPool.yieldSnapshot).sub(yieldAccrued);
    
    
        pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot.sub(pushio), PRECISSION);
    
         payload = abiCoder.encode(['address','uint256'], [user1.address,transferAmount]);
    
        lastUsersPool = usersPool;
    
   
    
      
        result = await applyUserEvent(
          SupplierEvent.TRANSFER,
          user2.address,
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
        await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0]);
        console.log('\x1b[36m%s\x1b[0m', '#11--- Period Tests passed ');
    
        // #endregion ================= 11th PERIOD ============================= //
    

  });
});
