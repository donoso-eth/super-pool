import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { initEnv, mineBlocks, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { expect } from 'chai';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { ERC20, ERC20__factory, IERC777, IERC777__factory, Events__factory, IOps, IOps__factory, ISuperfluidToken, ISuperfluidToken__factory, ISuperToken, ISuperToken__factory, IERC20, IERC20__factory } from '../typechain-types';

import { constants, utils } from 'ethers';
import { addUser, fromBnToNumber, getPool, getTimestamp, increaseBlockTime, matchEvent, printPoolResult, printUser, testPeriod, testTreasury } from './helpers/utils-V1';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { concatMap, from } from 'rxjs';
import { ethers } from 'hardhat';

import { ensureDirSync, readFileSync, removeSync } from 'fs-extra';
import { INETWORK_CONFIG } from 'hardhat/helpers/models';
import { join } from 'path';
import { applyUserEvent, faucet, updatePool } from './helpers/logic-V1';
import { ICONTRACTS_TEST, IPOOL_RESULT, ITREASURY_RESULT, IUSERS_TEST, IUSERTEST, SupplierEvent } from './helpers/models-V1';

import { abi_erc20mint } from '../helpers/abis/ERC20Mint';
import { gelatoBalance, getGelatoCloStream, getGelatoCloStreamId } from './helpers/gelato-V1';

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

let poolInternalImpl: PoolInternalV1;

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
let aaveERC20: IERC20;

let superPoolBalance: number;
let user1Balance: BigNumber;
let user2Balance: BigNumber;
let user3Balance: BigNumber;
let user4Balance: BigNumber;

let superTokenResolver;

let pools: { [key: number]: IPOOL_RESULT } = {};
let treasury: ITREASURY_RESULT;

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

let ONE_MONTH = 24 * 3600 * 30;
let ONE_DAY = 24 * 3600;
let ONE_HOUR = 3600;
const processDir = process.cwd();
let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];
removeSync(join(processDir,'expected','test-stream'));
ensureDirSync(join(processDir,'expected','test-stream'));
describe('V1 TEST STREAM UPDATES', function () {
  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: `https://goerli.infura.io/v3/1e43f3d31eea4244bf25ed4c13bfde0e`,
            blockNumber: 7850256,
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

    console.log('Super Pool Factory---> deployed');

    eventsLib = await new Events__factory(deployer).deploy();

    let aaveERC20: IERC20 = await IERC20__factory.connect(network_params.aToken, deployer);

    superTokenContract = await ISuperToken__factory.connect(network_params.superToken, deployer);
    superTokenERC777 = await IERC777__factory.connect(network_params.superToken, deployer);
    tokenContract = new hre.ethers.Contract(network_params.token, abi_erc20mint, deployer) as ERC20;

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

    await poolStrategy.initialize( network_params.superToken, network_params.token, poolProxyAddress, aavePool, aToken, network_params.aaveToken);
    console.log('Pool Strategy ---> initialized');

    superPool = PoolV1__factory.connect(superPoolAddress, deployer);
   // poolInternal = PoolInternalV1__factory.connect(poolInternalProxyAddress, deployer);

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

    await faucet(user3, tokenContract, superTokenContract);

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

    await testPeriod(BigNumber.from(t0), +t1 - t0, poolExpected1, contractsTest, usersPool,'test-stream');

    let yieldPool;
    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tests passed ');

    // #endregion ============== FIRST PERIOD ============================= //

    // #region =================  SECOND PERIOD ============================= //
    let timestamp = t1.add(BigNumber.from(2 * ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

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

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');
    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');

    // #endregion ================= SECOND PERIOD ============================= //

    // #region =================  3th PERIOD ============================= //
    timestamp = timestamp.add(BigNumber.from(ONE_MONTH));
    await setNextBlockTimestamp(hre, +timestamp);

    console.log('\x1b[36m%s\x1b[0m', '#3--- User1 redeem flow');

    let flowRate2 = utils.parseEther('100').div(ONE_MONTH);
    await waitForTx(superPool.connect(user1).redeemFlow(flowRate2));

    loanStream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user1.address,
      providerOrSigner: user1,
    });

    console.log(loanStream.deposit.toString());

    let initialWidthraw = BigNumber.from(4 * 3600).mul(flowRate2);
    let outFlowBuffer = BigNumber.from(1 * 3600).mul(flowRate2);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    let netFlow = flowRate2.sub(flowRate);
    let firstDay = netFlow.mul(BigNumber.from(24 * 3600));
    pool.poolTotalBalance = pool.poolTotalBalance.sub(loanStream.deposit);
    yieldSnapshot = yieldSnapshot.sub(flowRate.mul(ONE_MONTH)).add(initialWidthraw).add(outFlowBuffer);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate2]);
    lastUsersPool = usersPool;

    pool.poolBalance = pool.poolBalance.add(initialWidthraw).add(outFlowBuffer).add(firstDay).sub(loanStream.deposit);

    pool.aaveBalance = pool.aaveBalance
      .add(
        flowRate
          .mul(ONE_MONTH)
          .sub(initialWidthraw)
          .add(outFlowBuffer)
          .sub(firstDay)
          .div(10 ** 12)
      )
      .add(
        yieldAccrued
          .mul(100)
          .div(97)
          .div(10 ** 12)
      );

    pool.yieldSnapshot = pool.yieldSnapshot.add(flowRate.mul(ONE_MONTH)).sub(initialWidthraw).sub(outFlowBuffer);

    result = await applyUserEvent(SupplierEvent.OUT_STREAM_START, user1.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];
    let taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user1.address].expected.outStepTime, user1.address);
    usersPool[user1.address].expected.outStreamId = taskId;

    treasury = {
      superToken: pool.poolBalance,
      aave: pool.aaveBalance,
      yieldSnapshot: result[1].yieldSnapshot,
    };

  

    await testTreasury(timestamp, treasury, contractsTest,'test-stream');

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');

    console.log('\x1b[36m%s\x1b[0m', '#3--- Period Tests passed ');
    // #endregion ================= END 3TH PERIOD ============================= //



    // #region =================  4th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#4--- Gelato Closes Stream');
    timestamp = usersPool[user1.address].expected.nextExecOut;
    await setNextBlockTimestamp(hre, +timestamp);

    await getGelatoCloStream(superPool, +usersPool[user1.address].expected.nextExecOut, +usersPool[user1.address].expected.outStepTime, user1.address, ops, executor);

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);
    //yieldSnapshot = yieldSnapshot.sub(flowRate.mul(ONE_MONTH)).add(initialWidthraw).add(outFlowBuffer);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate2]);
    lastUsersPool = usersPool;

    pool.poolBalance = pool.poolBalance.sub(initialWidthraw).sub(outFlowBuffer).add(loanStream.deposit);

    pool.aaveBalance = pool.aaveBalance.add(initialWidthraw.add(outFlowBuffer).div(10 ** 12)).add(
      yieldAccrued
        .mul(100)
        .div(97)
        .div(10 ** 12)
    );

    result = await applyUserEvent(SupplierEvent.GELATO_CLOSE_STREAM, user1.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    let userClosing = usersPool[user1.address];

    let deposit = userClosing.expected.deposit;
    let realTimeBalance = userClosing.expected.realTimeBalance;

    usersPool[user1.address].expected.deposit = usersPool[user1.address].expected.deposit.sub(deposit);
    usersPool[user1.address].expected.realTimeBalance = usersPool[user1.address].expected.realTimeBalance.sub(realTimeBalance);
    usersPool[user1.address].expected.tokenBalance = usersPool[user1.address].expected.tokenBalance.add(realTimeBalance);

    pools[+timestamp].deposit = pools[+timestamp].deposit.sub(deposit);

    let poolAvailable = treasury.superToken.add(loanStream.deposit);

    let fromStrategy = realTimeBalance.sub(poolAvailable);

    treasury.yieldSnapshot = treasury.yieldSnapshot.add(yieldAccrued.mul(100).div(97)).sub(fromStrategy);
    //treasury.yieldSnapshot   .add(yieldAccrued).sub(fromStrategy)

    treasury.superToken = treasury.superToken.sub(treasury.superToken);

    (treasury.aave = pool.aaveBalance), await testTreasury(timestamp, treasury, contractsTest,'test-stream');

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');

    // #endregion ================= END 4TH PERIOD ============================= //

      

    // #region =================  5th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#5--- USer 1 start stream 60');
    timestamp = timestamp.add(ONE_MONTH);
    await setNextBlockTimestamp(hre, +timestamp);

    let flowRate60 = utils.parseEther('60').div(ONE_MONTH);

    createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolAddress,
      flowRate: flowRate60.toString(),
      superToken: network_params.superToken,
    });
    await createFlowOperation.exec(user1);

    fromUser1Stream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: user1.address,
      receiver: superPoolAddress,
      providerOrSigner: user1,
    });
    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);
    //yieldSnapshot = yieldSnapshot.sub(flowRate.mul(ONE_MONTH)).add(initialWidthraw).add(outFlowBuffer);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate60]);
    lastUsersPool = usersPool;

    pool.poolBalance = pool.poolBalance;

    pool.aaveBalance = pool.aaveBalance
      .add(
        yieldAccrued
          .mul(100)
          .div(97)
          .div(10 ** 12)
      )
      .add(flowRate.mul(ONE_MONTH));

    result = await applyUserEvent(SupplierEvent.STREAM_START, user1.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    treasury.yieldSnapshot = treasury.yieldSnapshot.add(yieldAccrued.mul(100).div(97)).add(flowRate.mul(ONE_MONTH));
    //treasury.yieldSnapshot   .add(yieldAccrued).sub(fromStrategy)

    treasury.superToken = treasury.superToken;

    treasury.aave = pool.aaveBalance;
    await testTreasury(timestamp, treasury, contractsTest,'test-stream');

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');

    console.log('\x1b[36m%s\x1b[0m', '#5--- Period Tests passed ');

    // #endregion ================= END 5TH PERIOD ============================= //

    // #region =================  6th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#6--- USer 2redeemFLow 60');
    timestamp = timestamp.add(ONE_MONTH);
    await setNextBlockTimestamp(hre, +timestamp);

    await waitForTx(superPool.connect(user2).redeemFlow(flowRate60));

    loanStream = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });
    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);
    //yieldSnapshot = yieldSnapshot.sub(flowRate.mul(ONE_MONTH)).add(initialWidthraw).add(outFlowBuffer);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate60]);
    lastUsersPool = usersPool;

    initialWidthraw = flowRate60.mul(4 * 3600);
    outFlowBuffer = flowRate60.mul(1 * 3600);

    pool.poolBalance = pool.poolBalance.sub(loanStream.deposit).add(initialWidthraw).add(outFlowBuffer);

    pool.aaveBalance = pool.aaveBalance
      .add(
        yieldAccrued
          .mul(100)
          .div(97)
          .div(10 ** 12)
      )
      .add(
        flowRate60
          .add(flowRate)
          .mul(ONE_MONTH)
          .div(10 ** 12)
      )
      .sub(initialWidthraw)
      .sub(outFlowBuffer.div(10 ** 12));

    result = await applyUserEvent(SupplierEvent.OUT_STREAM_START, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    treasury.yieldSnapshot = treasury.yieldSnapshot.add(yieldAccrued.mul(100).div(97)).add(flowRate60.add(flowRate).mul(ONE_MONTH)).sub(initialWidthraw).sub(outFlowBuffer);
    //treasury.yieldSnapshot   .add(yieldAccrued).sub(fromStrategy)

    treasury.superToken = treasury.superToken;

    treasury.aave = pool.aaveBalance;

    treasury.superToken = treasury.superToken.add(initialWidthraw).add(outFlowBuffer).sub(loanStream.deposit);

    await testTreasury(timestamp, treasury, contractsTest,'test-stream');

    taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');

    console.log('\x1b[36m%s\x1b[0m', '#6--- Period Tests passed ');

    // #endregion ================= END 6TH PERIOD ============================= //

    // #region =================  7th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#7--- User1 deposit 50 units');
    timestamp = timestamp.add(ONE_MONTH);
    await setNextBlockTimestamp(hre, +timestamp);

    let amount7 = utils.parseEther('50');

    await waitForTx(erc777.connect(user2).send(superPoolAddress, amount7, '0x'));

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool.poolTotalBalance = pool.poolTotalBalance.add(loanStream.deposit);
    //yieldSnapshot = yieldSnapshot.sub(flowRate.mul(ONE_MONTH)).add(initialWidthraw).add(outFlowBuffer);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['uint256'], [amount7]);
    lastUsersPool = usersPool;

    initialWidthraw = flowRate60.mul(4 * 3600);
    outFlowBuffer = flowRate60.mul(1 * 3600);

    // pool.poolBalance = pool.poolBalance;

    // pool.aaveBalance = pool.aaveBalance
    //   .add(
    //     yieldAccrued
    //       .mul(100)
    //       .div(97)
    //       .div(10 ** 12)
    //   )
    //   .sub(initialWidthraw)
    //   .sub(outFlowBuffer.div(10 ** 12));

    result = await applyUserEvent(SupplierEvent.DEPOSIT, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    treasury.yieldSnapshot = treasury.yieldSnapshot.add(initialWidthraw.sub(loanStream.deposit)).add(yieldAccrued.mul(100).div(97)).add(amount7);

    //treasury.yieldSnapshot   .add(yieldAccrued).sub(fromStrategy)

    treasury.superToken = treasury.superToken.sub(initialWidthraw).add(loanStream.deposit);

    treasury.aave = pool.aaveBalance;

    treasury.superToken = treasury.superToken;

    await testTreasury(timestamp, treasury, contractsTest,'test-stream');

    taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user2.address].expected.nextExecOut - +pool.timestamp, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');

    console.log('\x1b[36m%s\x1b[0m', '#7--- Period Tests passed ');

    // #endregion ================= END 7TH PERIOD ============================= //

    // #region =================  8th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#8--- User1 redeem 50 units');
    timestamp = timestamp.add(ONE_MONTH);
    await setNextBlockTimestamp(hre, +timestamp);

    let amount8 = utils.parseEther('50');

    await waitForTx(superPool.connect(user2).redeemDeposit(amount8));

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['uint256'], [amount8]);
    lastUsersPool = usersPool;

    // pool.aaveBalance = pool.aaveBalance
    //   .add(
    //     yieldAccrued
    //       .mul(100)
    //       .div(97)
    //       .div(10 ** 12)
    //   )
    //   .sub(initialWidthraw)
    //   .sub(outFlowBuffer.div(10 ** 12));

    result = await applyUserEvent(SupplierEvent.WITHDRAW, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];

    treasury.yieldSnapshot = treasury.yieldSnapshot.add(yieldAccrued.mul(100).div(97)).sub(amount8);

    //treasury.yieldSnapshot   .add(yieldAccrued).sub(fromStrategy)

    treasury.superToken = treasury.superToken;

    treasury.aave = pool.aaveBalance;

    treasury.superToken = treasury.superToken;

    await testTreasury(timestamp, treasury, contractsTest,'test-stream');

    taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');

    console.log('\x1b[36m%s\x1b[0m', '#8--- Period Tests passed ');

    // #endregion ================= END 8TH PERIOD ============================= //
   
    // #region =================  9th PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#9--- User1 redeem FLo to 40 units');
    timestamp = timestamp.add(ONE_MONTH);
    await setNextBlockTimestamp(hre, +timestamp);

    let flowRate9 = utils.parseEther('40').div(ONE_MONTH);

    await waitForTx(superPool.connect(user2).redeemFlow(flowRate9));

    let loanStream9 = await sf.cfaV1.getFlow({
      superToken: network_params.superToken,
      sender: superPoolAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldObject.yieldSnapshot;
    yieldAccrued = await yieldPool.yieldObject.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);
    payload = abiCoder.encode(['int96'], [flowRate9]);
    lastUsersPool = usersPool;

   

    let oldOutBuffer =  flowRate60.mul(1*3600);
    outFlowBuffer = flowRate9.mul(1 * 3600);


    result = await applyUserEvent(SupplierEvent.OUT_STREAM_UPDATE, user2.address, payload, lastUsersPool, pool, lastPool, pools, PRECISSION, sf, network_params.superToken, deployer, superPoolAddress);
    pools[+timestamp] = result[1];
    usersPool = result[0];


    treasury.yieldSnapshot = treasury.yieldSnapshot.add(yieldAccrued.mul(100).div(97))
   .add(treasury.superToken).sub(outFlowBuffer)
    ;



    treasury.aave = pool.aaveBalance;

    treasury.superToken = treasury.superToken
    .sub(oldOutBuffer.sub(outFlowBuffer))
    .add(loanStream.deposit).sub(loanStream9.deposit);

    await testTreasury(timestamp, treasury, contractsTest,'test-stream');

    taskId = await getGelatoCloStreamId(superPool, +timestamp, +usersPool[user2.address].expected.outStepTime, user2.address);
    usersPool[user2.address].expected.outStreamId = taskId;

    await testPeriod(BigNumber.from(t0), +timestamp, result[1], contractsTest, result[0],'test-steram');

    console.log('\x1b[36m%s\x1b[0m', '#9--- Period Tests passed ');

    // #endregion ================= END 9TH PERIOD ============================= //
  });
});
