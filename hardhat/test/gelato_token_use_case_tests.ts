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
  IOps,
  IOps__factory,
  ISuperfluidToken,
  ISuperfluidToken__factory,
  PoolFactory,
  PoolFactory__factory,
  SuperPoolHost,
  SuperPoolHost__factory,
} from '../typechain-types';

import { BigNumber, utils } from 'ethers';
import {
  fromBnToNumber,
  getPeriod,
  getTimestamp,
  increaseBlockTime,
  IPERIOD,
  IPERIOD_RESULT,
  IUSER_CHECK,
  IUSER_RESULT,
  matchEvent,
  printPeriod,
  printPeriodTest,
  printUser,
  testPeriod,
} from './helpers/utils';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';
import { from } from 'rxjs';
import { ethers } from 'hardhat';

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactory;
let superTokenPool: PoolFactory;
let supertokenContract: ISuperfluidToken;
let tokenContract: ERC777;
let contractsTest: any;

let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let TOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let GELATO_OPS = '0xB3f5503f93d5Ef84b06993a1975B9D21B962892F';
let GELATO = '0x25aD59adbe00C2d80c86d01e2E05e1294DA84823';
const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;

let executor: any;
let provider: BaseProvider;
let eventsLib: any;
let sf: Framework;

let t0: number;
let ops: IOps;
let erc777: ERC777;
let erc20: ERC20;
let superPoolTokenAddress: string;
let superPoolBalance: number;
let user1Balance: BigNumber;
let user2Balance: BigNumber;
let user3Balance: BigNumber;
let user4Balance: BigNumber;

let loanStream: IWeb3FlowInfo;
let fromUser1Stream: IWeb3FlowInfo;
let fromUser2Stream: IWeb3FlowInfo;
let fromUser3Stream: IWeb3FlowInfo;
let fromUser4Stream: IWeb3FlowInfo;
let PRECISSION = 10 ** 6;

let execData;
let execAddress;
let execSelector;
let resolverAddress;
let resolverData;
let resolverHash;

let taskId



describe.only('Gelato Use case test', function () {
  beforeEach(async () => {
    await hre.network.provider.request({
      method: 'hardhat_reset',
      params: [
        {
          forking: {
            jsonRpcUrl: process.env.MUMBAI_URL || '',
            blockNumber: 26566623,
          },
        },
      ],
    });

    [deployer, user1, user2, user3, user4] = await initEnv(hre);
    provider = hre.ethers.provider;

    superPoolHost = await new SuperPoolHost__factory(deployer).deploy(HOST);

    poolFactory = await new PoolFactory__factory(deployer).deploy();

    eventsLib = await new Events__factory(deployer).deploy();

    supertokenContract = await ISuperfluidToken__factory.connect(TOKEN1, deployer);
    tokenContract = await ERC777__factory.connect(TOKEN1, deployer);

    let superInputStruct: SuperPoolInputStruct = {
      poolFactory: poolFactory.address,
      superToken: TOKEN1,
      ops: GELATO_OPS,
    };
    await superPoolHost.createSuperPool(superInputStruct);

    superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(TOKEN1);

    superTokenPool = PoolFactory__factory.connect(superPoolTokenAddress, deployer);
    let initialPoolEth = hre.ethers.utils.parseEther('10');

    let balance = await provider.getBalance(superPoolTokenAddress);

    await deployer.sendTransaction({ to: superPoolTokenAddress, value: initialPoolEth });
    balance = await provider.getBalance(superPoolTokenAddress);
 

    tokenContract.approve(superPoolTokenAddress, hre.ethers.constants.MaxUint256);

    ops = IOps__factory.connect(GELATO_OPS, deployer);

    contractsTest = {
      poolAddress: superPoolTokenAddress,
      superTokenContract: supertokenContract,
      superTokenPool: superTokenPool,
      tokenContract,
      ops,
    };

    sf = await Framework.create({
      networkName: 'local',
      provider: provider,
      customSubgraphQueriesEndpoint: 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-mumbai',
      resolverAddress: '0x8C54C83FbDe3C59e59dd6E324531FB93d4F504d3',
    });

    /////========== Give aCL permissions to PoolFactoty=========== ///////

    let authOperation = await sf.cfaV1.authorizeFlowOperatorWithFullControl({
      flowOperator: superPoolTokenAddress,
      superToken: TOKEN1,
    });
    await authOperation.exec(user2);

    erc20 = await ERC20__factory.connect(TOKEN1, user2);
    // await waitForTx(erc20.increaseAllowance(superPoolTokenAddress, hre.ethers.utils.parseEther("500")))

    /////// Cleaning and preparing init state /////////
    await tokenContract.transfer(superPoolTokenAddress, utils.parseEther('50'));

    user1Balance = await tokenContract.balanceOf(user1.address);

    user2Balance = await tokenContract.balanceOf(user2.address);

    user3Balance = await tokenContract.balanceOf(user3.address);

    user4Balance = await tokenContract.balanceOf(user4.address);

    if (user1Balance.toString() !== '0') {
      await tokenContract.connect(user1).transfer(deployer.address, user1Balance);
    }
    await tokenContract.transfer(user1.address, utils.parseEther('10'));

    if (user2Balance.toString() !== '0') {
      await tokenContract.connect(user2).transfer(deployer.address, user2Balance);
    }
    await tokenContract.transfer(user2.address, utils.parseEther('10'));

    if (user3Balance.toString() !== '0') {
      await tokenContract.connect(user3).transfer(deployer.address, user3Balance);
    }
    await tokenContract.transfer(user3.address, utils.parseEther('10'));

    if (user4Balance.toString() !== '0') {
      await tokenContract.connect(user4).transfer(deployer.address, user4Balance);
    }
    await tokenContract.transfer(user4.address, utils.parseEther('10'));

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);
    user3Balance = await tokenContract.balanceOf(user3.address);
    user4Balance = await tokenContract.balanceOf(user4.address);

    expect(user1Balance).to.equal(utils.parseEther('10'));
    expect(user2Balance).to.equal(utils.parseEther('10'));
    expect(user3Balance).to.equal(utils.parseEther('10'));
    expect(user4Balance).to.equal(utils.parseEther('10'));

    superPoolBalance = +(await tokenContract.balanceOf(superPoolTokenAddress)).toString();
    expect(superPoolBalance).to.equal(50 * 10 ** 18);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x25aD59adbe00C2d80c86d01e2E05e1294DA84823'],
    });

    executor = await hre.ethers.provider.getSigner('0x25aD59adbe00C2d80c86d01e2E05e1294DA84823');
  });

  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //
    /******************************************************************
     *              FIRST PERIOD (T0)
     *              USER1 deposit 20 units
     *              ---------------------
     *              Pool Total Shares = 20
     *              ---------------------
     *             
     *              User1 Total Balance = 20
     *              User1 Total Shares = 20
 
     *
     *****************************************************************/
    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 20 units at t0 ');

    erc777 = await ERC777__factory.connect(TOKEN1, user1);

    await waitForTx(erc777.send(superPoolTokenAddress, 20000, '0x'));
    t0 = +(await superTokenPool.lastPeriodTimestamp());

    let expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(20000));

    let periodExpected1: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(20000),
      deposit: BigNumber.from(20000000000),
    };

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);
    user3Balance = await tokenContract.balanceOf(user2.address);

    let usersTest: Array<{ address: string; name: string; expected: IUSER_RESULT }> = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(20000),
          shares: BigNumber.from(20000),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20000)),
          deposit: BigNumber.from(20000).mul(BigNumber.from(PRECISSION)),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(0),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 0, periodExpected1, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tested #######');
    console.log('');

    // #endregion FIST PERIOD

    await setNextBlockTimestamp(hre, t0 + 10);

    // #region ================= SECOND PERIOD ============================= //

    /******************************************************************
     *              SECOND PERIOD (T0 + 10)
     *              User2 start stream 5 uints/sec
     *              ---------------------
     *              Pool Total Shares = 20
     *
     *              Pool InFlow = 5 unitd/sec
     *              ---------------------
     *              User1 Total Balance = 20
     *              User1 Total Shares = 20
     *              User2 Total Balance = 0
     *              User2 Total Shares = 0
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 20
     *              User1 Asset Balance = 10 eth - 20
     *              User2 asset Balance = 10 eth -flowDeposit
     *
     *****************************************************************/
    console.log('\x1b[36m%s\x1b[0m', '#2--- User2 provides starts a stream at t0 + 10 ');

    const createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '500',
      superToken: TOKEN1,
    });
    await createFlowOperation.exec(user2);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(20000));

    let periodExpected2: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(500),
      totalShares: BigNumber.from(20000),
      deposit: BigNumber.from(20000).mul(PRECISSION),
      outFlowAssetsRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(0),
    };

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(20000),
          shares: BigNumber.from(20000),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20000)),
          deposit: BigNumber.from(20000).mul(BigNumber.from(PRECISSION)),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(0),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(0),
          shares: BigNumber.from(0),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(500),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 10, periodExpected2, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');
    console.log('');

    // #endregion SECOND PERIOD

    await setNextBlockTimestamp(hre, t0 + 20);

    // #region ================= THIRD PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#3--- Pool accred 1000 units/sec at t0 + 20');
    await waitForTx(superTokenPool.mockYield(1000));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(25000));

    let periodExpected3: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(500),
      yieldAccruedSec: BigNumber.from(1000),
      totalShares: BigNumber.from(25000),
      deposit: BigNumber.from(20000).mul(PRECISSION),
      outFlowAssetsRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(5000000000),
    };

    ///////////// User1 balance

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(20000),
          shares: BigNumber.from(20000),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20000)),
          deposit: BigNumber.from(20000).mul(BigNumber.from(PRECISSION)),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(0),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(5000),
          shares: BigNumber.from(5000),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(5000))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(500),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 20, periodExpected3, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#3--- Period Tests passed ');
    console.log('');

    // #endregion THIRD PERIOD

    await setNextBlockTimestamp(hre, t0 + 30);

    // #region ================= FOURTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#4--- user 1 redeemflow(200)');

    let superTokenPoolUser1 = PoolFactory__factory.connect(superPoolTokenAddress, user1);
    await waitForTx(superTokenPoolUser1.redeemFlow(200));

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(+loanStream.deposit)
      .add(BigNumber.from(40000));

    let periodExpected4: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(500),
      yieldAccruedSec: BigNumber.from(1000),
      totalShares: BigNumber.from(30000),
      deposit: BigNumber.from(0),
      outFlowAssetsRate: BigNumber.from(272),
      outFlowRate: BigNumber.from(200),
      depositFromInFlowRate: BigNumber.from(10000000000),
      depositFromOutFlowRate: BigNumber.from(27272720000),
    };

    execData = superTokenPool.interface.encodeFunctionData('stopstream', [user1.address, true]);
    execAddress = superTokenPool.address;
    execSelector = await ops.getSelector('stopstream(address,bool)');
    resolverAddress = superTokenPool.address;
    resolverData = await superTokenPool.interface.encodeFunctionData('checkerStopStream', [user1.address, true]);

    resolverHash = utils.keccak256(new utils.AbiCoder().encode(['address', 'bytes'], [resolverAddress, resolverData]));

    taskId = await ops.getTaskId(superTokenPool.address, execAddress, execSelector, false, ETH, resolverHash);

    ///////////// User1 balance

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(27272),
          shares: BigNumber.from(20000),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20000)),
          deposit: BigNumber.from(27272720000),
          outAssets: BigNumber.from(272),
          outAssetsId: taskId,
          nextExec: BigNumber.from(t0).add(BigNumber.from(30)).add(BigNumber.from(100)),
          outFlow: BigNumber.from(200),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(30),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(12727),
          shares: BigNumber.from(10000),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(10000))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(500),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 30, periodExpected4, contractsTest, usersTest);



    // await setNextBlockTimestamp(hre, t0 + 130);

    // await ops.connect(executor).exec(hre.ethers.utils.parseEther('0.1'), ETH, superTokenPool.address, false, true, resolverHash, execAddress, execData);

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    console.log('');

    // #endregion FOURTH PERIOD
  
    await setNextBlockTimestamp(hre, t0 + 40);

    // #region ================= FIVE PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#5--- user 1 redeemflow(100)');

     await waitForTx(superTokenPoolUser1.redeemFlow(100));// _poolUpdateCurrentState()) ;/

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(+loanStream.deposit)
      .add(BigNumber.from(53000));

    let periodExpected5: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(500),
      yieldAccruedSec: BigNumber.from(1000),
      totalShares: BigNumber.from(30000),
      deposit: BigNumber.from(0),
      outFlowAssetsRate: BigNumber.from(195),
      outFlowRate: BigNumber.from(100),
      depositFromInFlowRate: BigNumber.from(15000000000),
      depositFromOutFlowRate: BigNumber.from(29255212352),

    };

   
    ///////////// User1 balance

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(29255),
          shares: BigNumber.from(18000),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20000)),
          deposit: BigNumber.from(29255212352),
          outAssets: BigNumber.from(195),
          outAssetsId: taskId,
          nextExec: BigNumber.from(t0).add(BigNumber.from(40)).add(BigNumber.from(180)),
          outFlow: BigNumber.from(100),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(40),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(23744),
          shares: BigNumber.from(10000),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(15000))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(500),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 40, periodExpected5, contractsTest, usersTest);

    throw new Error('');

    await setNextBlockTimestamp(hre, t0 + 130);

    await ops.connect(executor).exec(hre.ethers.utils.parseEther('0.1'), ETH, superTokenPool.address, false, true, resolverHash, execAddress, execData);

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    console.log('');

    // #endregion FOURTH PERIOD


  });
});
