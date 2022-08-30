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

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactory;
let superTokenPool: PoolFactory;
let supertokenContract: ISuperfluidToken;
let tokenContract: ERC777;
let contractsTest: any;

let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let TOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let GELATO_OPS = '0xB3f5503f93d5Ef84b06993a1975B9D21B962892F';

let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;

let provider: BaseProvider;
let eventsLib: any;
let sf: Framework;
let t0: number;

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

describe.only('TOKEN Use case test', function () {
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

    tokenContract.approve(superPoolTokenAddress, hre.ethers.constants.MaxUint256);

    contractsTest = {
      poolAddress: superPoolTokenAddress,
      superTokenContract: supertokenContract,
      superTokenPool: superTokenPool,
      tokenContract,
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

    await waitForTx(erc777.send(superPoolTokenAddress, 20, '0x'));
    t0 = +(await superTokenPool.lastPeriodTimestamp());

    let expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(20));

    let periodExpected1: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(20),
      deposit: BigNumber.from(20000000),
    };

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);
    user3Balance = await tokenContract.balanceOf(user2.address);

    let usersTest: Array<{ address: string; name: string; expected: IUSER_RESULT }> = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(20),
          shares: BigNumber.from(20),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)),
          deposit: BigNumber.from(20).mul(BigNumber.from(PRECISSION)),
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
      flowRate: '5',
      superToken: TOKEN1,
    });
    await createFlowOperation.exec(user2);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(20));

    let periodExpected2: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      totalShares: BigNumber.from(20),
      deposit: BigNumber.from(20).mul(PRECISSION),
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
          realTimeBalance: BigNumber.from(20),
          shares: BigNumber.from(20),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)),
          deposit: BigNumber.from(20).mul(BigNumber.from(PRECISSION)),
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
          inFlow: BigNumber.from(5),
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

    /******************************************************************
     *              THIRD PERIOD (T0 + 20)
     *              Yield Start Accrued 10 units/second
     *              ---------------------
     *              Pool Assest Balance = 70
     *              Pool Total Shares = 70
     *
     *              Pool InFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              ---------------------
     *              User1 Total Balance = 20
     *              User1 Total Shares = 20
     *              User2 Total Balance = 50
     *              User2 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 70
     *              User1 Asset Balance = 10 eth - 20
     *              User2 asset Balance = 10 eth -flowDeposit - 50
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#3--- Pool accred 10 units/sec at t0 + 20');
    await waitForTx(superTokenPool.mockYield(10));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(70));

    let periodExpected3: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      totalShares: BigNumber.from(70),
      deposit: BigNumber.from(20).mul(PRECISSION),
      outFlowAssetsRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(50).mul(PRECISSION),
    };

    ///////////// User1 balance

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(20),
          shares: BigNumber.from(20),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)),
          deposit: BigNumber.from(20).mul(BigNumber.from(PRECISSION)),
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
          realTimeBalance: BigNumber.from(50),
          shares: BigNumber.from(50),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(50))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
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

    /******************************************************************
     *              FOURTH PERIOD (T0 + 30)
     *              Yield Start Accrued 20 units/second
     *              ---------------------
     *              PoolBalance = 220
     *              Pool Total Shares = 120
     *
     *              Pool InFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 20
     *              ---------------------
     *              User1 Total Balance = 41052620
     *              User1 Total Shares = 20
     *              User2 Total Balance = 178947365
     *              User2 Total Shares = 100
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 220
     *              User1 Asset Balance = 10 eth - 20
     *              User2 asset Balance = 10 eth -flowDeposit - 100
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#4--- Pool accred 20 units/sec at t0 + 30');
    await waitForTx(superTokenPool.mockYield(20));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(220));

    let periodExpected4: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      totalShares: BigNumber.from(120),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(15789473),
      yieldTokenIndex: BigNumber.from(1052631),
      deposit: BigNumber.from(20).mul(PRECISSION),
      outFlowAssetsRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(100).mul(PRECISSION),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(41),
          shares: BigNumber.from(20),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)),
          deposit: BigNumber.from(20).mul(BigNumber.from(PRECISSION)),
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
          realTimeBalance: BigNumber.from(178),
          shares: BigNumber.from(100),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(100))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 30, periodExpected4, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    console.log('');

    // #endregion FOURTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 40);

    // #region ================= FIFTH PERIOD ============================= //

    /******************************************************************
     *              FIFTH PERIOD (T0 + 40)
     *              User1 start stream 6 units/second
     *              ---------------------
     *              PoolBalance = 470
     *              Pool Total Shares = 170
     *              Pool Deposit = 68000000
     *
     *              Pool InFlow = 11 unitd/sec
     *              Yield Accrued units/sec = 20
     *              ---------------------
     *              User1 Total Balance = 68000000
     *              User1 Total Shares = 20
     *              User2 Total Balance = 401361155
     *              User2 Total Shares = 150
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 470
     *              User1 Asset Balance = 10 eth - 20 -flowdeposit
     *              User2 asset Balance = 10 eth -flowDeposit - 150
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#5--- USser 1 start stream 6 units/sec at t0 + 40');

    const operation = sf.cfaV1.createFlow({
      receiver: superTokenPool.address,
      flowRate: '6',
      superToken: TOKEN1,
    });

    await operation.exec(user1);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(470));

    let periodExpected5: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(50272231),
      yieldTokenIndex: BigNumber.from(2431941),
      depositFromInFlowRate: BigNumber.from(150).mul(PRECISSION),
      totalShares: BigNumber.from(170),
      deposit: BigNumber.from(68638820),
      outFlowAssetsRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
    };

    ///////////// User1 balance

    fromUser1Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user1.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(68),
          shares: BigNumber.from(20),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(20)),
          deposit: BigNumber.from(68638820),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(6),
          timestamp: BigNumber.from(40),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(401),
          shares: BigNumber.from(150),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(150))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 40, periodExpected5, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#5--- Period Tests passed ');
    console.log('');

    // #endregion FIFTH  PERIOD

    await setNextBlockTimestamp(hre, t0 + 50);

    // #region ================= SIXTH PERIOD ============================= //

    /******************************************************************
     *              SIXTH PERIOD (T0 + 50)
     *              User1 deposit 50 units
     *              ---------------------
     *              PoolBalance = 830
     *              PoolShares = 330
     *
     *              PoolDeposit = 130
     *              Pool InFlow = 11 unitd/sec
     *              Yield Accrued units/sec = 20
     *              Index Yield Token = 3320829
     *              Index Yield In-FLOW = 66837887
     *              ---------------------
     *              User1 Total Balance = 295810516
     *              User1 Total Shares = 130
     *              User2 Total Balance = 534189435
     *              User2 Total Shares = 200
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 830
     *              User1 Asset Balance = 10 eth - 20 -flowdeposit - 60 - 50
     *              User2 asset Balance = 10 eth -flowDeposit - 200
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#6--- User1 deposit 50 units at to + 50');

    await waitForTx(erc777.send(superPoolTokenAddress, 50, '0x'));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(830));

    let periodExpected6: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(63893371),
      yieldTokenIndex: BigNumber.from(3162831),
      depositFromInFlowRate: BigNumber.from(200).mul(PRECISSION),
      deposit: BigNumber.from(310533087),
      totalShares: BigNumber.from(330),
      outFlowAssetsRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(310),
          shares: BigNumber.from(130),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(130)),
          deposit: BigNumber.from(310533087),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(6),
          timestamp: BigNumber.from(50),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(519),
          shares: BigNumber.from(200),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(200))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 50, periodExpected6, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#6--- Period Tests passed ');
    console.log('');

    // #endregion SIXTH  PERIOD

    await setNextBlockTimestamp(hre, t0 + 60);

    // #region ================= SEVENTH PERIOD ============================= //

    /******************************************************************
     *              SEVENTH PERIOD (T0 + 60)
     *              Yield accrued to 10 units/sec
     *              ---------------------
     *              PoolBalance = 1140
     *              PoolShares = 440
     *
     *              PoolDeposit = 70
     *              Pool InFlow = 11 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 3840309
     *              Index Yield In-FLOW = 78880389
     *              ---------------------
     *              User1 Total Balance = 495597928
     *              User1 Total Shares = 190
     *              User2 Total Balance = 644401945
     *              User2 Total Shares = 250
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1140
     *              User1 Asset Balance = 10 eth - 20 -flowdeposit - 60 - 50 -60
     *              User2 asset Balance = 10 eth -flowDeposit - 250
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#7--- Yield accrued changed to 10 units/sec t0 + 60');

    await waitForTx(superTokenPool.mockYield(10));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1140));

    let periodExpected7: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(72091589),
      yieldTokenIndex: BigNumber.from(3516479),
      depositFromInFlowRate: BigNumber.from(310000000),
      totalShares: BigNumber.from(440),
      outFlowAssetsRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      deposit: BigNumber.from(310533087),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(529),
          shares: BigNumber.from(190),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(190)),
          deposit: BigNumber.from(310533087),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(6),
          timestamp: BigNumber.from(50),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(610),
          shares: BigNumber.from(250),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(250))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(10),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 60, periodExpected7, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#7--- Period Tests passed ');
    console.log('');

    // #endregion SEVENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 70);

    // #region ================= EIGTH PERIOD ============================= //

    /******************************************************************
     *              EIGTH PERIOD (T0 + 70)
     *              User2 reddemflow 4
     *              ---------------------
     *              PoolBalance = 1350 - Flow deposit
     *              PoolShares = 550
     *
     *              PoolDeposit = 857
     *              Pool InFlow = 11 unitd/sec
     *              Pool OutFlow = 9 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4042329
     *              Index Yield In-FLOW = 85583786
     *              ---------------------
     *              User1 Total Balance = 622080910
     *              User1 Total Shares = 250
     *              User2 Total Balance = 727000000
     *              User2 Total Shares = 300
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1350 -flowdeposit
     *              User1 Asset Balance = 10 eth - 20 - 60 - 50 -60 -60
     *              User2 asset Balance = 10 eth -flowDeposit - 300
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#8--- User2 RedeemFlow 4 untis/Sec t0 + 70');

    let superTokenPoolUser2 = PoolFactory__factory.connect(superPoolTokenAddress, user2);
    await waitForTx(superTokenPoolUser2.redeemFlow(4));

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(1350))
      .sub(BigNumber.from(+loanStream.deposit));

    let periodExpected8: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(6),
      outFlowRate: BigNumber.from(4),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(77003534),
      yieldTokenIndex: BigNumber.from(3664510),
      deposit: BigNumber.from(310533087),
      depositFromInFlowRate: BigNumber.from(120).mul(PRECISSION),
      depositFromOutFlowRate: BigNumber.from(685017670),
      totalShares: BigNumber.from(550),
      outFlowAssetsRate: BigNumber.from(9),
    };

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    expect(+fromUser2Stream.deposit).to.equal(0);

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(664),
          shares: BigNumber.from(250),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(250)),
          deposit: BigNumber.from(310533087),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(6),
          timestamp: BigNumber.from(50),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(685),
          shares: BigNumber.from(300),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(300)),
          deposit: BigNumber.from(685017670),
          outAssets: BigNumber.from(9),
          outFlow: BigNumber.from(4),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(70),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 70, periodExpected8, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#8--- Period Tests passed ');
    console.log('');

    // #endregion EIGTH  PERIOD

    await setNextBlockTimestamp(hre, t0 + 80);

    // #region ================= NINETH PERIOD ============================= //

    /******************************************************************
     *              NINETH PERIOD (T0 + 80)
     *              User2 Update stream to 4 units/sec previous 5 units/sex
     *              ---------------------
     *              PoolBalance = 1430
     *              PoolShares = 570
     *
     *              PoolDeposit = 777
     *              Pool InFlow = 10 unitd/se8
     *              Pool OutFlow = 0 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4145741
     *              Index Yield In-FLOW = 88169101
     *              Index Yield Out-Assets = 517063
     *              ---------------------
     *              User1 Total Balance = 711036360
     *              User1 Total Shares = 310
     *              User2 Total Balance = 718044068
     *              User2 Total Shares = 260
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1430
     *              User1 Asset Balance = 10 eth - 20  -flowDeposit - 60 - 50 -60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80 -flowDeposit
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#9--- User2 Update stream to 4 t0 + 80');

    const operationUpdate = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '4',
      superToken: TOKEN1,
    });

    await operationUpdate.exec(user2);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1420));

    let periodExpected9: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(963705058),
      inFlowRate: BigNumber.from(10),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(79275123),
      yieldTokenIndex: BigNumber.from(3755373),
      yieldOutFlowRateIndex: BigNumber.from(6461589),
      depositFromInFlowRate: BigNumber.from(180).mul(PRECISSION),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(570),
      outFlowAssetsRate: BigNumber.from(0),
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
          realTimeBalance: BigNumber.from(766),
          shares: BigNumber.from(310),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(310)),
          deposit: BigNumber.from(310533087),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(6),
          timestamp: BigNumber.from(50),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(653),
          shares: BigNumber.from(260),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(300))
            .sub(BigNumber.from(+fromUser2Stream.deposit))
            .add(BigNumber.from(90)),
          deposit: BigNumber.from(653171971),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(4),
          timestamp: BigNumber.from(80),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 80, periodExpected9, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#9--- Period Tests passed ');
    console.log('');

    // #endregion NINETH  PERIOD

    await setNextBlockTimestamp(hre, t0 + 90);

    // #region ================= TENTH PERIOD ============================= //

    /******************************************************************
     *              TENTH PERIOD (T0 + 90)
     *              User2 withdraw 100 units
     *              ---------------------
     *              PoolBalance = 1530
     *              PoolShares = 570
     *
     *              PoolDeposit = 617
     *              Pool InFlow = 10 unitd/se8
     *              Pool OutFlow = 0 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4245045
     *              Index Yield In-FLOW = 90453112
     *              Index Yield Out-FLOW = 8880558
     *              ---------------------
     *              User1 Total Balance = 797649946
     *              User1 Total Shares = 370
     *              User2 Total Balance = 735402356
     *              User2 Total Shares = 200
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1430
     *              User1 Asset Balance = 10 eth - 20  -flowDeposit - 60 - 50 -60 -60 -60 - 60
     *              User2 asset Balance = 10 eth  - 300 + 80 -flowDeposit -40 + 100 * factor
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#10--- User2 withdraw 100 units at t0 + 90');

    await waitForTx(superTokenPoolUser2.redeemDeposit(100));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1420));

    let periodExpected10: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(866129676),
      inFlowRate: BigNumber.from(10),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(81201897),
      yieldTokenIndex: BigNumber.from(3839145),
      yieldOutFlowRateIndex: BigNumber.from(6461589),
      depositFromInFlowRate: BigNumber.from(240000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(570),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(864),
          shares: BigNumber.from(370),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(370)),
          deposit: BigNumber.from(310533087),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(6),
          timestamp: BigNumber.from(50),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(555),
          shares: BigNumber.from(200),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(340))
            .sub(BigNumber.from(+fromUser2Stream.deposit))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(555596589),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(4),
          timestamp: BigNumber.from(90),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 90, periodExpected10, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#10--- Period Tests passed ');
    console.log('');

    // #endregion TENTH  PERIOD

    await setNextBlockTimestamp(hre, t0 + 100);

    // #region ================= ELEVENTH PERIOD ============================= //

    /******************************************************************
     *              ELEVENTH PERIOD (T0 + 100)
     *              User2 stpo streams to pool
     *              ---------------------
     *              PoolBalance = 1630
     *              PoolShares = 670
     *
     *              PoolDeposit = 657
     *              Pool InFlow = 6 unitd/se8
     *              Pool OutFlow = 0 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4355298
     *              Index Yield In-FLOW = 93650465
     *              Index Yield Out-FLOW = 8880558
     *              ---------------------
     *              User1 Total Balance = 891166954
     *              User1 Total Shares = 430
     *              User2 Total Balance = 737912819
     *              User2 Total Shares = 240
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1630
     *              User1 Asset Balance = 10 eth - 20  -flowDeposit - 60 - 50 -60 -60 -60 - 60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#11--- User2 stop stream at t0 + 100');

    const operationDelete = sf.cfaV1.deleteFlow({
      receiver: superPoolTokenAddress,
      sender: user2.address,
      superToken: TOKEN1,
    });

    await operationDelete.exec(user2);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1620));

    let periodExpected11: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(964219478),
      inFlowRate: BigNumber.from(6),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(83710266),
      yieldTokenIndex: BigNumber.from(3925640),
      yieldOutFlowRateIndex: BigNumber.from(6461589),
      depositFromInFlowRate: BigNumber.from(300000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(670),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(966),
          shares: BigNumber.from(430),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(430)),
          deposit: BigNumber.from(310533087),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(6),
          timestamp: BigNumber.from(50),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(653),
          shares: BigNumber.from(240),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(653686391),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(100),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 100, periodExpected11, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#11--- Period Tests passed ');
    console.log('');

    // #endregion ELEVENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 110);

    // #region ================= TWELVETH PERIOD ============================= //

    /******************************************************************
     *              TWELVETH PERIOD (T0 + 110)
     *              User1 redeem flow 5 units
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 730
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4456615
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 8880558
     *              ---------------------
     *              User1 Total Balance = 997000000
     *              User1 Total Shares = 490
     *              User2 Total Balance = 791306878
     *              User2 Total Shares = 240
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#12--- User1 redeem flow 5 units at t0 + 110');

    let superTokenPoolUser1 = PoolFactory__factory.connect(superPoolTokenAddress, user1);
    await waitForTx(superTokenPoolUser1.redeemFlow(5));

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1780).sub(+loanStream.deposit));

    let periodExpected12: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(653686391),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(87959931),
      yieldTokenIndex: BigNumber.from(4002906),
      yieldOutFlowRateIndex: BigNumber.from(6461589),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(1075803530),
      totalShares: BigNumber.from(730),
      outFlowAssetsRate: BigNumber.from(10),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1075),
          shares: BigNumber.from(490),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)),
          deposit: BigNumber.from(1075803530),
          outAssets: BigNumber.from(10),
          outFlow: BigNumber.from(5),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(110),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(704),
          shares: BigNumber.from(240),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(653686391),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(100),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 110, periodExpected12, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#12--- Period Tests passed ');
    console.log('');

    // #endregion TWELVETH PERIOD

    await setNextBlockTimestamp(hre, t0 + 120);

    // #region ================= THHIRTEENTH  PERIOD ============================= //

    /******************************************************************
     *              THHIRTEENTH  PERIOD (T0 + 120)
     *              User2 transfer 50 shares to user 3
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#13--- User2 transfer to user3 50 units');

    erc20 = await ERC20__factory.connect(superPoolTokenAddress, user2);
    await waitForTx(erc20.transfer(user3.address, 50));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1780).sub(+loanStream.deposit));

    let periodExpected13: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(743115265),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(87959931),
      yieldTokenIndex: BigNumber.from(4062447),
      yieldOutFlowRateIndex: BigNumber.from(12569416),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(975803530),
      totalShares: BigNumber.from(680),
      outFlowAssetsRate: BigNumber.from(10),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1036),
          shares: BigNumber.from(440),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(100)),
          deposit: BigNumber.from(975803530),
          outAssets: BigNumber.from(10),
          outFlow: BigNumber.from(5),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(110),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(593),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(150),
          shares: BigNumber.from(50),
          tokenBalance: utils.parseEther('10'),
          deposit: BigNumber.from(150000000),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 120, periodExpected13, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#13--- Period Tests passed ');
    console.log('');

    // #endregion THHIRTEENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 130);

    // #region ================= FOURTEENTH PERIOD ============================= //

    /******************************************************************
     *              FOURTEENTH PERIO (T0 + 130)
     *              User1 stop reddem flow
     *              ---------------------
     *              PoolBalance = 1790
     *              PoolShares = 630
     *
     *              PoolDeposit = 1324
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 0 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4597237
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 21469735
     *              ---------------------
     *              User1 Total Balance = 922891770
     *              User1 Total Shares = 390
     *              User2 Total Balance = 708136672
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 157278000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#14--- User1 stop redeemflow');

    erc20 = await ERC20__factory.connect(superPoolTokenAddress, user2);

    await waitForTx(superTokenPoolUser1.redeemFlowStop());

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1780));

    let periodExpected14: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1735470315),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(87959931),
      yieldTokenIndex: BigNumber.from(4122366),
      yieldOutFlowRateIndex: BigNumber.from(18116741),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(630),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(992),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(628),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(158),
          shares: BigNumber.from(50),
          tokenBalance: utils.parseEther('10'),
          deposit: BigNumber.from(150000000),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 140, periodExpected14, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#14--- Period Tests passed ');
    console.log('');

    // #endregion FOURTEENTH  PERIOD

    await setNextBlockTimestamp(hre, t0 + 140);

    // #region ================= FIFTEENTH PERIOD ============================= //

    /******************************************************************
     *              FIFTEENTH PERIO (T0 + 140)
     *              User3 withdraw 15
     *              ---------------------
     *              PoolBalance = 1890 - 45 (15*factor)
     *              PoolShares = 615
     *
     *              PoolDeposit = 1279
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 0 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4672765
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 21469735
     *              ---------------------
     *              User1 Total Balance = 983087586
     *              User1 Total Shares = 390
     *              User2 Total Balance = 732971728
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 127246200
     *              USer3 Total Shares = 35
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1890 - 45 (15*factor)
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 15
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#15--- User3 redeem 15 shares');

    let superTokenPoolUser3 = await superTokenPool.connect(user3);

    await waitForTx(superTokenPoolUser3.redeemDeposit(15));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1880)).sub(BigNumber.from(45));

    let periodExpected15: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1708101315),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(87959931),
      yieldTokenIndex: BigNumber.from(4179987),
      yieldOutFlowRateIndex: BigNumber.from(18116741),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(615),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1049),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(662),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(122),
          shares: BigNumber.from(35),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(45)),
          deposit: BigNumber.from(122631000),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(140),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 140, periodExpected15, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#15--- Period Tests passed ');
    console.log('');

    // #endregion FIFTEENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 150);

    // #region ================= SIXTEENTH PERIOD ============================= //

    /******************************************************************
     *              SIXTEENTH PERIO (T0 + 150)
     *              User3 start to stream to pool (5 tokens/sec)
     *              ---------------------
     *              PoolBalance = 1945
     *              PoolShares = 615
     *
     *              PoolDeposit = 1279
     *              Pool InFlow = 5 unitd/se8
     *              Pool OutFlow = 0 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4750951
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 21469735
     *              ---------------------
     *              User1 Total Balance = 1045401828
     *              User1 Total Shares = 390
     *              User2 Total Balance = 762447850
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 135455730
     *              USer3 Total Shares = 35
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1890 - 45 (15*factor)
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 15 - flow deposit
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#16--- User3 start stream 5 supertokens/ss');

    const operationUser3create = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '5',
      superToken: TOKEN1,
    });

    await operationUser3create.exec(user3);

    fromUser3Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user3.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1980)).sub(BigNumber.from(45));

    let periodExpected16: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1715280624),
      inFlowRate: BigNumber.from(5),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(87959931),
      yieldTokenIndex: BigNumber.from(4238531),
      yieldOutFlowRateIndex: BigNumber.from(18116741),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(615),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1107),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(697),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(129),
          shares: BigNumber.from(35),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(45))
            .sub(BigNumber.from(+fromUser3Stream.deposit)),
          deposit: BigNumber.from(129810309),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(150),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 150, periodExpected16, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#16--- Period Tests passed ');
    console.log('');

    // #endregion SIXTEENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 160);

    // #region ================= SEVENTEENTH PERIOD ============================= //

    /******************************************************************
     *              SEVENTEENTH PERIO (T0 + 160)
     *              User3 update to stream to pool (3 tokens/sec)
     *              ---------------------
     *              PoolBalance = 2095
     *              PoolShares = 665
     *
     *              PoolDeposit = 1329
     *              Pool InFlow = 3 unitd/se8
     *              Pool OutFlow = 0 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4827638
     *              Index Yield In-FLOW =  99606341
     *              Index Yield Out-FLOW = 21469735
     *              ---------------------
     *              User1 Total Balance = 1106521367
     *              User1 Total Shares = 390
     *              User2 Total Balance =  791358849
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 195425040
     *              USer3 Total Shares = 85
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1890 - 45 (15*factor)
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 15 -50 - flow deposit
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#17--- User3 update stream to 3 supertokens/s');

    const operationUser3update = sf.cfaV1.updateFlow({
      receiver: superPoolTokenAddress,
      flowRate: '3',
      superToken: TOKEN1,
    });

    await operationUser3update.exec(user3);

    fromUser3Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user3.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(2085));

    let periodExpected17: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1774176199),
      inFlowRate: BigNumber.from(3),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88247240),
      yieldTokenIndex: BigNumber.from(4295992),
      yieldOutFlowRateIndex: BigNumber.from(18116741),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(665),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1164),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(731),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(188),
          shares: BigNumber.from(85),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(45))
            .sub(BigNumber.from(50))
            .sub(BigNumber.from(+fromUser3Stream.deposit)),
          deposit: BigNumber.from(188705884),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(3),
          timestamp: BigNumber.from(160),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 160, periodExpected17, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#17--- Period Tests passed ');
    console.log('');

    // #endregion SEVENTEENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 170);

    // #region ================= EIGTHTEENTH PERIOD ============================= //

    /******************************************************************
     *              EIGTHTEENTH PERIO (T0 + 170)
     *              User3 redeem Flow 2 units/sec
     *              ---------------------
     *              PoolBalance = 2225 - flowdeposit
     *              PoolShares = 695
     *
     *              PoolDeposit = 1359
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 2 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4902042
     *              Index Yield In-FLOW =  99978364
     *              Index Yield Out-FLOW = 21469735
     *              ---------------------
     *              User1 Total Balance = 1165821355
     *              User1 Total Shares = 390
     *              User2 Total Balance = 819409157
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 287180369
     *              USer3 Total Shares = 115
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1890 - 45 (15*factor)
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 15
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#18--- User3 redeemfloe 2 supertokens/s');

    await waitForTx(superTokenPoolUser3.redeemFlow(2));

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user3.address,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2215))
      .sub(+loanStream.deposit);

    let periodExpected18: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1585470315),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(2),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88526698),
      yieldTokenIndex: BigNumber.from(4351883),
      yieldOutFlowRateIndex: BigNumber.from(18116741),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(230091218),
      totalShares: BigNumber.from(695),
      outFlowAssetsRate: BigNumber.from(4),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1220),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(764),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(230),
          shares: BigNumber.from(115),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(45)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(230091218),
          outAssets: BigNumber.from(4),
          outFlow: BigNumber.from(2),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(170),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 170, periodExpected18, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#18--- Period Tests passed ');
    console.log('');

    // #endregion EIGHTTEENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 180);

    // #region ================= NINETEENTH PERIOD ============================= //

    /******************************************************************
     *              NINETEENTH PERIOD (T0 + 180)
     *              User3 redeem Flow  update to 4 units/sec
     *              ---------------------
     *              PoolBalance = 2285 - flowdeposit
     *              PoolShares = 675
     *
     *              PoolDeposit = 1174
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4973881
     *              Index Yield In-FLOW =  99978364
     *              Index Yield Out-FLOW = 25384964
     *              ---------------------
     *              User1 Total Balance = 1223077038
     *              User1 Total Shares = 390
     *              User2 Total Balance = 846492460
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 213660916
     *              USer3 Total Shares = 95
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1890 - 45 (15*factor)
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 5
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#19--- User3 update redeemfloe to 5 supertokens/s');

    await waitForTx(superTokenPoolUser3.redeemFlow(4));

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user3.address,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2275))
      .sub(+loanStream.deposit);

    let periodExpected19: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1585470315),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(4),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88526698),
      yieldTokenIndex: BigNumber.from(4407575),
      yieldOutFlowRateIndex: BigNumber.from(21041887),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(201791802),
      totalShares: BigNumber.from(675),
      outFlowAssetsRate: BigNumber.from(8),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1275),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(797),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(201),
          shares: BigNumber.from(95),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(85)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(201791802),
          outAssets: BigNumber.from(8),
          outFlow: BigNumber.from(4),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(180),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 180, periodExpected19, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#19--- Period Tests passed ');
    console.log('');

    // #endregion NINETEENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 190);

    // #region ================= TWENTIETH PERIOD ============================= //

    /******************************************************************
     *              TWENTIETH PERIOD (T0 + 180)
     *              Accrued yield 20 units second
     *              ---------------------
     *              PoolBalance = 2305 - flowdeposit
     *              PoolShares = 635
     *
     *              PoolDeposit = 1174
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 4 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 5048956
     *              Index Yield In-FLOW =  99978364
     *              Index Yield Out-FLOW = 26867696
     *              ---------------------
     *              User1 Total Balance = 1282911813
     *              User1 Total Shares = 390
     *              User2 Total Balance = 874795735
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 145522772
     *              USer3 Total Shares = 55
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 22305 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 5
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#20---- yield accrued 20/units second');

    await waitForTx(superTokenPool.mockYield(20));

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2295))
      .sub(+loanStream.deposit);

    let periodExpected20: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1585470315),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(4),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(88526698),
      yieldTokenIndex: BigNumber.from(4464807),
      yieldOutFlowRateIndex: BigNumber.from(22199353),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(121791802),
      totalShares: BigNumber.from(635),
      outFlowAssetsRate: BigNumber.from(8),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1332),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(831),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(131),
          shares: BigNumber.from(55),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(165)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(121791802),
          outAssets: BigNumber.from(8),
          outFlow: BigNumber.from(4),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(180),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 190, periodExpected20, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#20--- Period Tests passed ');
    console.log('');

    // #endregion 20TH PERIOD

    await setNextBlockTimestamp(hre, t0 + 200);

    // #region ================= 21ST PERIOD ============================= //

    /******************************************************************
     *              21TH PERIOD (T0 + 200)
     *              user3 reddem flow to 1 shares/sec
     *              ---------------------
     *              PoolBalance = 2425 - flowdeposit
     *              PoolShares = 595
     *
     *              PoolDeposit = 1174
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 2 unitd/sec
     *              Yield Accrued units/sec = 20
     *              Index Yield Token = 5208700
     *              Index Yield In-FLOW =  99978364
     *              Index Yield Out-FLOW = 28425203
     *              ---------------------
     *              User1 Total Balance = 1410227781
     *              User1 Total Shares = 390
     *              User2 Total Balance = 935019223
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 77982828
     *              USer3 Total Shares = 15
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 22305 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 5
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#21---- user3 redeem flow updated to 10');

    await waitForTx(superTokenPoolUser3.redeemFlow(1));

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user3.address,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2415))
      .sub(+loanStream.deposit);

    let periodExpected21: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1585470315),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(1),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(88526698),
      yieldTokenIndex: BigNumber.from(4584764),
      yieldOutFlowRateIndex: BigNumber.from(23425791),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(60863034),
      totalShares: BigNumber.from(595),
      outFlowAssetsRate: BigNumber.from(4),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1451),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(902),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(60),
          shares: BigNumber.from(15),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(245)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(60863034),
          outAssets: BigNumber.from(4),
          outFlow: BigNumber.from(1),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(200),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 200, periodExpected21, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#21--- Period Tests passed ');
    console.log('');

    // #endregion NINETEENTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 210);

    // #region ================= 22nd PERIOD ============================= //

    /******************************************************************
     *              22nd PERIOD (T0 + 210)
     *              user3 start strem 5 tokrn/sec
     *              ---------------------
     *              PoolBalance = 2425 - flowdeposit
     *              PoolShares = 595
     *
     *              PoolDeposit = 1174
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 2 unitd/sec
     *              Yield Accrued units/sec = 20
     *              Index Yield Token = 5208700
     *              Index Yield In-FLOW =  99978364
     *              Index Yield Out-FLOW = 28425203
     *              ---------------------
     *              User1 Total Balance = 1410227781
     *              User1 Total Shares = 390
     *              User2 Total Balance = 935019223
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 77982828
     *              USer3 Total Shares = 15
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 22305 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 5
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#22---- user3 start stream 5 token/sec');

    const operationUser3Create21 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '5',
      superToken: TOKEN1,
    });

    await operationUser3Create21.exec(user3);

    fromUser3Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user3.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(2575));

    let periodExpected22: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1611358521),
      inFlowRate: BigNumber.from(5),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(88526698),
      yieldTokenIndex: BigNumber.from(4707740),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(585),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1573),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(975),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(200)),
          deposit: BigNumber.from(593115265),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(120),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(25),
          shares: BigNumber.from(5),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(40))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 210, periodExpected22, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#22--- Period Tests passed ');
    console.log('');

    // #endregion 22nd PERIOD

    await setNextBlockTimestamp(hre, t0 + 220);

    // #region ================= 23rd PERIOD ============================= //

    /******************************************************************
     *              23nd PERIOD (T0 + 220)
     *              user3 start strem 5 tokrn/sec
     *              ---------------------
     *              PoolBalance = 2425 - flowdeposit
     *              PoolShares = 595
     *
     *              PoolDeposit = 1174
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 2 unitd/sec
     *              Yield Accrued units/sec = 20
     *              Index Yield Token = 5208700
     *              Index Yield In-FLOW =  99978364
     *              Index Yield Out-FLOW = 28425203
     *              ---------------------
     *              User1 Total Balance = 1410227781
     *              User1 Total Shares = 390
     *              User2 Total Balance = 935019223
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 77982828
     *              USer3 Total Shares = 15
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 22305 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60 + 100
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth + 5
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#23---- user2 start stream 7 token/sec');

    const operationUser2Create23 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '7',
      superToken: TOKEN1,
    });

    await operationUser2Create23.exec(user2);

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(2825));

    let periodExpected23: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(2066583383),
      inFlowRate: BigNumber.from(12),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(89137811),
      yieldTokenIndex: BigNumber.from(4829962),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(50000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(635),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1694),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(992355050),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(130),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1048),
          shares: BigNumber.from(190),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(380))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1048340127),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(220),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(82),
          shares: BigNumber.from(55),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(90))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 210, periodExpected23, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#23--- Period Tests passed ');
    console.log('');

    // #endregion 23rd PERIOD

    await setNextBlockTimestamp(hre, t0 + 230);

    // #region ================= 24th PERIOD ============================= //

    /******************************************************************
     *              THHIRTEENTH  PERIOD (T0 + 120)
     *              User1 transfer 100 shares to user 2
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#24--- User1 transfer to user2 100 units');

    erc20 = await ERC20__factory.connect(superPoolTokenAddress, user1);
    await waitForTx(erc20.transfer(user2.address, 100));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(3145));

    let periodExpected24: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3032179290),
      inFlowRate: BigNumber.from(12),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(89980109),
      yieldTokenIndex: BigNumber.from(4921849),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(100000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(755),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1385),
          shares: BigNumber.from(290),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(200)),
          deposit: BigNumber.from(1385726042),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(230),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1620),
          shares: BigNumber.from(360),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(380))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(70))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1620565042),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(230),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(138),
          shares: BigNumber.from(105),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(140))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 230, periodExpected24, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#24--- Period Tests passed ');
    console.log('');

    // #endregion 24th PERIOD


//    throw new Error("");
    

    await setNextBlockTimestamp(hre, t0 + 240);

    // #region ================= 25th PERIOD ============================= //

    /******************************************************************
     *              25th  PERIOD (T0 + 120)
     *              User1 in stream 3
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#25--- User1 in stream 3');

    const operationUser1Create25 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '3',
      superToken: TOKEN1,
    });

    await operationUser1Create25.exec(user1);

    fromUser1Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user1.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user1,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(3465));

    let periodExpected25: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3118999183),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(90815483),
      yieldTokenIndex: BigNumber.from(4984502),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(220000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(875),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1472),
          shares: BigNumber.from(290),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(490))
            .sub(+fromUser1Stream.deposit)
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(1472545935),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(3),
          timestamp: BigNumber.from(240),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1797),
          shares: BigNumber.from(430),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(380))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(140))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1620565042),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(230),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(194),
          shares: BigNumber.from(155),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(190))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 240, periodExpected25, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#25--- Period Tests passed ');
    console.log('');

    // #endregion 25th PERIOD

    await setNextBlockTimestamp(hre, t0 + 250);

    // #region ================= 26th PERIOD ============================= //

    /******************************************************************
     *              25th  PERIOD (T0 + 120)
     *              Yield accrued 10 unit sec
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#26--- yield accrued 1o units/sec');

    await waitForTx(superTokenPool.mockYield(10));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(3815));

    let periodExpected26: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3118999183),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(91967602),
      yieldTokenIndex: BigNumber.from(5043084),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(370000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(1025),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1592),
          shares: BigNumber.from(320),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(520))
            .sub(+fromUser1Stream.deposit)
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(1472545935),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(3),
          timestamp: BigNumber.from(240),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1970),
          shares: BigNumber.from(500),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(380))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(210))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1620565042),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(230),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(251),
          shares: BigNumber.from(205),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(240))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 250, periodExpected26, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#26--- Period Tests passed ');
    console.log('');

    // #endregion 26th PERIOD

    await setNextBlockTimestamp(hre, t0 + 260);

    // #region ================= 27th PERIOD ============================= //

    /******************************************************************
     *              27th  PERIOD (T0 + 120)
     *              user4 start stream
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#27--- user4 stream 10 units/sec');

    const operationUser4Create27 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '10',
      superToken: TOKEN1,
    });

    await operationUser4Create27.exec(user4);

    fromUser4Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user4.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user4,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(4065));

    let periodExpected27: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3118999183),
      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(92800000),
      yieldTokenIndex: BigNumber.from(5071142),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(520000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(1175),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1666),
          shares: BigNumber.from(350),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(550))
            .sub(+fromUser1Stream.deposit)
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(1472545935),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(3),
          timestamp: BigNumber.from(240),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2092),
          shares: BigNumber.from(570),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(450))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(210))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1620565042),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(230),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(306),
          shares: BigNumber.from(255),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(290))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(0),
          shares: BigNumber.from(0),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(260),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 260, periodExpected27, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#27--- Period Tests passed ');
    console.log('');

    // #endregion 27th PERIOD
    await setNextBlockTimestamp(hre, t0 + 270);

    // #region ================= 28th PERIOD ============================= //

    /******************************************************************
     *              28th  PERIOD (T0 + 120)
     *              mock yiels 20 units/sec
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#28--- mock yield 20 units/sec');

    await waitForTx(superTokenPool.mockYield(20));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(4415));

    let periodExpected28: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3118999183),
      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(93485441),
      yieldTokenIndex: BigNumber.from(5097709),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(770000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(1425),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1737),
          shares: BigNumber.from(380),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(580))
            .sub(+fromUser1Stream.deposit)
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(1472545935),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(3),
          timestamp: BigNumber.from(240),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2210),
          shares: BigNumber.from(640),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(520))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(210))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1620565042),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(230),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(360),
          shares: BigNumber.from(305),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(340))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(106),
          shares: BigNumber.from(100),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(100))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(260),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 270, periodExpected28, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#28--- Period Tests passed ');
    console.log('');

    // #endregion 28th PERIOD
  
    await setNextBlockTimestamp(hre, t0 + 280);

    // #region ================= 29th PERIOD ============================= //

    /******************************************************************
     *              29th  PERIOD (T0 + 120)
     *              user2 redeem 250 units
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '#29--- user2 redeems 250');

    await waitForTx(superTokenPoolUser2.redeemDeposit(250));



    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(4115));

    let periodExpected29: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3121760027),
      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(95269198),
      yieldTokenIndex: BigNumber.from(5147534),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(670000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(1425),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1845),
          shares: BigNumber.from(410),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(610))
            .sub(+fromUser1Stream.deposit)
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(1472545935),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(3),
          timestamp: BigNumber.from(240),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1623),
          shares: BigNumber.from(460),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(520))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(280))
            .add(BigNumber.from(750))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1623325886),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(280),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(420),
          shares: BigNumber.from(355),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(390))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(224),
          shares: BigNumber.from(200),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(200))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(260),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 280, periodExpected29, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#29--- Period Tests passed ');
    console.log('');

    // #endregion 29th PERIOD
  
    await setNextBlockTimestamp(hre, t0 + 290);

    // #region ================= 30th PERIOD ============================= //


    console.log('\x1b[36m%s\x1b[0m', '30--- user4 deposti 300');

    let erc777User4 = await ERC777__factory.connect(TOKEN1, user4);

    await waitForTx(erc777User4.send(superPoolTokenAddress, 300, '0x'));


    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(4865));

    let periodExpected30: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3762689917),
      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(96892989),
      yieldTokenIndex: BigNumber.from(5198596),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(620000000),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(1975),
      outFlowAssetsRate: BigNumber.from(0),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1956),
          shares: BigNumber.from(440),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(640))
            .sub(+fromUser1Stream.deposit)
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(1472545935),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(3),
          timestamp: BigNumber.from(240),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1787),
          shares: BigNumber.from(530),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(520))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(350))
            .add(BigNumber.from(750))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1623325886),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(280),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(480),
          shares: BigNumber.from(405),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(440))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(640),
          shares: BigNumber.from(600),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(600))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(640929890),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(290),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 290, periodExpected30, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#30--- Period Tests passed ');
    console.log('');

    // #endregion 30th PERIOD
    await setNextBlockTimestamp(hre, t0 + 300);

    // #region ================= 31st PERIOD ============================= //

    /******************************************************************
     *              31st  PERIOD (T0 + 120)
     *              user1 redeem flo 15
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 527
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 15305252
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 677059612
     *              User2 Total Shares = 190
     *              User3 Tola Balalnce = 150000000
     *              USer3 Total Shares = 50
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1790 - flow deposit
     *              User1 Asset Balance = 10 eth - 20   - 60 - 50 -60 -60 -60 - 60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80  -40 + 100 * factor - 40
     *              User3 asset Balance = 10 eth
     *
     *****************************************************************/

    console.log('\x1b[36m%s\x1b[0m', '31--- user1 reddem flow 15');

    await waitForTx(superTokenPoolUser1.redeemFlow(15));
    
    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user1,
    });


    expedtedPoolBalance = utils.parseEther('50')
    .sub(BigNumber.from(+loanStream.deposit))
    .add(BigNumber.from(5315));

    let periodExpected31: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(2290143982),
      inFlowRate: BigNumber.from(22),
      outFlowRate: BigNumber.from(15),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(98215174),
      yieldTokenIndex: BigNumber.from(5242964),
      yieldOutFlowRateIndex: BigNumber.from(24682084),
      depositFromInFlowRate: BigNumber.from(690000000),
      depositFromOutFlowRate: BigNumber.from(2055342175),
      totalShares: BigNumber.from(2225),
      outFlowAssetsRate: BigNumber.from(65),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(2055),
          shares: BigNumber.from(470),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(670))
            .add(BigNumber.from(200)),
          deposit: BigNumber.from(2055342175),
          outAssets: BigNumber.from(65),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(300),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1938),
          shares: BigNumber.from(600),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(590))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(350))
            .add(BigNumber.from(750))
            .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1623325886),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(7),
          timestamp: BigNumber.from(280),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(538),
          shares: BigNumber.from(455),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(490))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(782),
          shares: BigNumber.from(700),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(700))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(640929890),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(290),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 300, periodExpected31, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#31--- Period Tests passed ');
    console.log('');

    // #endregion 31th PERIOD
  
    await setNextBlockTimestamp(hre, t0 + 310);

    // #region ================= 32nd PERIOD ============================= //


    console.log('\x1b[36m%s\x1b[0m', '32--- user2 reddem flow 9');

    await waitForTx(superTokenPoolUser2.redeemFlow(9));
    
    let loanStreamuser2 = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });


    expedtedPoolBalance = utils.parseEther('50')
    .sub(BigNumber.from(+loanStream.deposit))
    .sub(BigNumber.from(+loanStreamuser2.deposit))
    .add(BigNumber.from(5085));

    let periodExpected32: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(666818096),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(99723886),
      yieldTokenIndex: BigNumber.from(5284453),
      yieldOutFlowRateIndex: BigNumber.from(25786563),
      depositFromInFlowRate: BigNumber.from(700000000),
      depositFromOutFlowRate: BigNumber.from(3492115033),
      totalShares: BigNumber.from(2295),
      outFlowAssetsRate: BigNumber.from(93),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1477),
          shares: BigNumber.from(320),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(670))
            .add(BigNumber.from(850)),
          deposit: BigNumber.from(1405342175),
          outAssets: BigNumber.from(65),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(300),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2086),
          shares: BigNumber.from(670),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(590))
            .add(BigNumber.from(90))
            .add(BigNumber.from(200))
            .sub(BigNumber.from(420))
            .add(BigNumber.from(750)),
          //  .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(2086772858),
          outAssets: BigNumber.from(28),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(310),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(596),
          shares: BigNumber.from(505),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(540))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(924),
          shares: BigNumber.from(800),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(800))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(640929890),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(290),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 310, periodExpected32, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#32--- Period Tests passed ');
    console.log('');

    // #endregion 32nd PERIOD
  

    await setNextBlockTimestamp(hre, t0 + 320);

    // #region ================= 33rd PERIOD ============================= //


    console.log('\x1b[36m%s\x1b[0m', '33--- user1 deposit 450');

  
    let erc777User1 = await ERC777__factory.connect(TOKEN1, user1);

    await waitForTx(erc777User1.send(superPoolTokenAddress, 450, '0x'));

    


    expedtedPoolBalance = utils.parseEther('50')
    .sub(BigNumber.from(+loanStream.deposit))
    .sub(BigNumber.from(+loanStreamuser2.deposit))
    .add(BigNumber.from(4955));

    let periodExpected33: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(666818096),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(102036145),
      yieldTokenIndex: BigNumber.from(5329206),
      yieldOutFlowRateIndex: BigNumber.from(27243269),
      depositFromInFlowRate: BigNumber.from(850000000),
      depositFromOutFlowRate: BigNumber.from(3178592058)  ,
      totalShares: BigNumber.from(2655),
      outFlowAssetsRate: BigNumber.from(58),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1371),
          shares: BigNumber.from(620),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1120))
            .add(BigNumber.from(1500)),
          deposit: BigNumber.from(1371819200),
          outAssets: BigNumber.from(30),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(320),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1847),
          shares: BigNumber.from(580),
          tokenBalance: utils
          .parseEther('10')
          .sub(BigNumber.from(590))
          .add(BigNumber.from(90))
          .add(BigNumber.from(200))
          .sub(BigNumber.from(420))
          .add(BigNumber.from(1030)),
          //  .sub(+fromUser2Stream.deposit),
          deposit: BigNumber.from(1806772858),
          outAssets: BigNumber.from(28),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(310),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(659),
          shares: BigNumber.from(555),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(245))
            .sub(BigNumber.from(590))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(25888206),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(1076),
          shares: BigNumber.from(900),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(900))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(640929890),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(290),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 320, periodExpected33, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#33--- Period Tests passed ');
    console.log('');

    // #endregion 33nd PERIOD
  });

});
