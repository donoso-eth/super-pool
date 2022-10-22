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
  GelatoTasksV1,
  GelatoTasksV1__factory,
  IOps,
  IOps__factory,
  ISuperfluidToken,
  ISuperfluidToken__factory,
  ISuperToken,
  ISuperToken__factory,
  PoolV1,
  PoolV1__factory,
  PoolInternalV1,
  PoolInternalV1__factory,
  PoolStrategyV1,
  PoolStrategyV1__factory,
  ResolverSettingsV1,
  ResolverSettingsV1__factory,
  STokenV1,
  STokenV1__factory,
  SuperPoolHost,
  SuperPoolHost__factory,
  IERC20,
  IERC20__factory,
} from '../typechain-types';

import { constants, utils } from 'ethers';
import { addUser, fromBnToNumber, getPool, getTimestamp, increaseBlockTime, matchEvent, printPeriod, printPoolResult, printUser, testPeriod } from './helpers/utils-V1';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { ResolverSettingsInitilizerStruct, SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';
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

let superPoolHost: SuperPoolHost;
let poolFactory: PoolV1;
let sTokenFactory: STokenV1;
let gelatoTasks: GelatoTasksV1;
let poolStrategy: PoolStrategyV1;
let settings: ResolverSettingsV1;
let poolInternal: PoolInternalV1;

let superPool: PoolV1;
let superPoolAddress: string;
let sToken: STokenV1;
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

describe('V1 ONLY TRANSFER', function () {
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
    poolFactory = await new PoolV1__factory(deployer).deploy();
    console.log('Pool Factory---> deployed: ');
    sTokenFactory = await new STokenV1__factory(deployer).deploy();
    console.log('Token Factotokery---> deployed');

    //
    gelatoTasks = await new GelatoTasksV1__factory(deployer).deploy();
    console.log('Gelato Resolver---> deployed');

    poolStrategy = await new PoolStrategyV1__factory(deployer).deploy();
    console.log('Pool Strategy---> deployed');

    settings = await new ResolverSettingsV1__factory(deployer).deploy();
    console.log('Settings ---> deployed');

    poolInternal = await new PoolInternalV1__factory(deployer).deploy();
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

    // await poolInternal.initialize(settings.address);
    // console.log('Pool Internal ---> initialized');

    await gelatoTasks.initialize(network_params.ops, superPoolAddress, poolInternal.address);
    console.log('Gelato Tasks ---> initialized');
    await poolStrategy.initialize(
      network_params.ops,
      network_params.superToken,
      network_params.token,
      superPoolAddress,
      aavePool,
      aToken,
      '0xA2025B15a1757311bfD68cb14eaeFCc237AF5b43',
      poolInternal.address
    );
    console.log('Pool Strategy ---> initialized');

    superPool = PoolV1__factory.connect(superPoolAddress, deployer);

    sToken = STokenV1__factory.connect(sTokenAddress, deployer);

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

    t0 = +(await superPool.lastPoolTimestamp());
    console.log(t0.toString());
    let iintUser1 = await superTokenContract.balanceOf(user1.address);
    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 800 units at t0 ');

    erc777 = await IERC777__factory.connect(network_params.superToken, user1);

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

    console.log('\x1b[36m%s\x1b[0m', '#3--- User2  provides 500');

    await setNextBlockTimestamp(hre, +t1 + 2 * ONE_DAY);
    timestamp = t1.add(BigNumber.from(2 * ONE_DAY));

    let user2Amount = utils.parseEther('500');
    let iintUser2 = await superTokenContract.balanceOf(user2.address);

    await waitForTx(erc777.connect(user2).send(superPoolAddress, user2Amount, '0x'));

    let yieldPool = await superPool.getLastPool();

    let yieldSnapshot = await yieldPool.yieldSnapshot;
    let yieldAccrued = yieldPool.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    payload = abiCoder.encode(['uint96'], [user2Amount]);

    let lastUsersPool = usersPool;
    if (lastUsersPool[user2.address] == undefined) {
      lastUsersPool[user2.address] = addUser(user2.address, 2, timestamp);
    }
    lastUsersPool[user2.address].expected.tokenBalance = iintUser2;

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

    await testPeriod(BigNumber.from(t0), +t1 + 2 * ONE_DAY, result[1], contractsTest, result[0]);

    console.log('\x1b[36m%s\x1b[0m', '#3--- Period Tests passed ');
    // #endregion =================   THIRD PERIOD ============================= //

    // #region =================  FOURTH PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#4--- Transfer ');

    timestamp = timestamp.add(BigNumber.from(ONE_DAY));
    await setNextBlockTimestamp(hre, +timestamp);
    let transferAmount = utils.parseEther('400');
    await waitForTx(sToken.connect(user2).transfer(user1.address, transferAmount));

    yieldPool = await superPool.getLastPool();

    yieldSnapshot = await yieldPool.yieldSnapshot;
    yieldAccrued = yieldPool.yieldAccrued;
    lastPool = Object.assign({}, pool);

    pool = updatePool(lastPool, timestamp, yieldAccrued, yieldSnapshot, PRECISSION);

    payload = abiCoder.encode(['address', 'uint256'], [user1.address, transferAmount]);

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

    console.log('\x1b[36m%s\x1b[0m', '#14--- Period Tests passed ');

    // #endregion ================= 11th PERIOD ============================= //
  });
});
