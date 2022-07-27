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
} from './helpers/utils';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactory;
let superTokenPool: PoolFactory;
let supertokenContract: ISuperfluidToken;
let tokenContract: ERC777;

let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let TOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let GELATO_OPS = '0xB3f5503f93d5Ef84b06993a1975B9D21B962892F';

let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;

let provider: BaseProvider;
let eventsLib: any;
let sf: Framework;
let t0: number;

let erc777: ERC777;
let erc20:ERC20;
let superPoolTokenAddress: string;
let superPoolBalance: number;
let user1Balance: BigNumber;
let user2Balance: BigNumber;
let user3Balance: BigNumber;

let loanStream: IWeb3FlowInfo;
let fromUser1Stream: IWeb3FlowInfo;
let fromUser2Stream: IWeb3FlowInfo;
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

    [deployer, user1, user2, user3] = await initEnv(hre);
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

      erc20 = await ERC20__factory.connect(TOKEN1, user2)
    // await waitForTx(erc20.increaseAllowance(superPoolTokenAddress, hre.ethers.utils.parseEther("500")))



    /////// Cleaning and preparing init state /////////
    await tokenContract.transfer(superPoolTokenAddress, utils.parseEther('50'));

    user1Balance = await tokenContract.balanceOf(user1.address);

    user2Balance = await tokenContract.balanceOf(user2.address);

    user3Balance = await tokenContract.balanceOf(user3.address);

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

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);
    user3Balance = await tokenContract.balanceOf(user3.address);

    expect(user1Balance).to.equal(utils.parseEther('10'));
    expect(user2Balance).to.equal(utils.parseEther('10'));
    expect(user3Balance).to.equal(utils.parseEther('10'));

    superPoolBalance = +(await tokenContract.balanceOf(superPoolTokenAddress)).toString();
    expect(superPoolBalance).to.equal(50 * 10 ** 18);

    t0 = parseInt(await getTimestamp());
  });

  it('should be successfull', async function () {
    // #region 1 period
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

    let superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(20));

    let period1: IPERIOD_RESULT = await getPeriod(superTokenPool);

    let periodResult1: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      totalShares: period1.totalShares,
      deposit: period1.deposit,
    };

    let periodExpected1: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(20),
      deposit: BigNumber.from(20),
    };

    let user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    let user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    let user1Shares = await superTokenPool.balanceOf(user1.address);
    let user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    let users: Array<IUSER_CHECK> = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: { realTimeBalance: BigNumber.from(20).mul(PRECISSION), shares: BigNumber.from(20), tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: { realTimeBalance: BigNumber.from(0), shares: BigNumber.from(0), tokenBalance: utils.parseEther('10') },
      },
    ];

    await printPeriodTest(periodResult1, periodExpected1, users);

    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tested #######');
    console.log('');

    // #endregion 1 period

    await setNextBlockTimestamp(hre, t0 + 10);

    // #region 2 period

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

    let period2: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(20));

    let periodResult2: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period2.inFlowRate,
      totalShares: period2.totalShares,
    };

    let periodExpected2: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      totalShares: BigNumber.from(20),
    };

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: { realTimeBalance: BigNumber.from(20).mul(PRECISSION), shares: BigNumber.from(20), tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: { realTimeBalance: BigNumber.from(0), shares: BigNumber.from(0), tokenBalance: utils.parseEther('10').sub(BigNumber.from(+fromUser2Stream.deposit)) },
      },
    ];

    await printPeriodTest(periodResult2, periodExpected2, users);

    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');
    console.log('');

    await setNextBlockTimestamp(hre, t0 + 20);

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

    // #region ================= THIRD PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#3--- Pool accred 10 units/sec at t0 + 20');
    await waitForTx(superTokenPool.mockYield(10));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period3: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(70));

    let periodResult3: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period3.inFlowRate,
      yieldAccruedSec: period3.yieldAccruedSec,
      totalShares: period3.totalShares,
    };

    let periodExpected3: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      totalShares: BigNumber.from(70),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: { realTimeBalance: BigNumber.from(20).mul(PRECISSION), shares: BigNumber.from(20), tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(5).mul(10).mul(PRECISSION),
          shares: BigNumber.from(50),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(50))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
        },
      },
    ];

    await printPeriodTest(periodResult3, periodExpected3, users);

    console.log('\x1b[36m%s\x1b[0m', '#3--- Period Tests passed ');
    console.log('');

    await setNextBlockTimestamp(hre, t0 + 30);

    // #endregion THIRD PERIOD

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

    // #region ================= FOURTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#4--- Pool accred 40 units/sec at t0 + 30');
    await waitForTx(superTokenPool.mockYield(20));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period4: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(220));

    let periodResult4: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period4.inFlowRate,
      totalShares: period4.totalShares,
      yieldAccruedSec: period4.yieldAccruedSec,
      yieldTokenIndex: period4.yieldTokenIndex,
      yieldInFlowRateIndex: period4.yieldInFlowRateIndex,
    };

    let periodExpected4: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      totalShares: BigNumber.from(120),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(15789473),
      yieldTokenIndex: BigNumber.from(1052631),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: { realTimeBalance: BigNumber.from(41052620), shares: BigNumber.from(20), tokenBalance: utils.parseEther('10').sub(BigNumber.from(20)) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(178947365),
          shares: BigNumber.from(100),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(100))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
        },
      },
    ];

    await printPeriodTest(periodResult4, periodExpected4, users);

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    console.log('');

    // #endregion FOURTH PERIOD

    await setNextBlockTimestamp(hre, t0 + 40);

    /******************************************************************
     *              FIFTH PERIOD (T0 + 40)
     *              User1 start stream 6 units/second
     *              ---------------------
     *              PoolBalance = 470
     *              Pool Total Shares = 170
     *
     *              Pool InFlow = 11 unitd/sec
     *              Yield Accrued units/sec = 20
     *              ---------------------
     *              User1 Total Balance = 68638820
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

    // #region ================= FIFTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#5--- USser 1 start stream 6 units/sec at t0 + 40');

    const operation = sf.cfaV1.createFlow({
      receiver: superTokenPool.address,
      flowRate: '6',
      superToken: TOKEN1,
    });

    await operation.exec(user1);

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period5: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(470));

    let periodResult5: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period5.inFlowRate,
      yieldAccruedSec: period5.yieldAccruedSec,
      yieldTokenIndex: period5.yieldTokenIndex,
      yieldInFlowRateIndex: period5.yieldInFlowRateIndex,
      depositFromInFlowRate: period5.depositFromInFlowRate,
      totalShares: period5.totalShares,
    };

    let periodExpected5: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(50272231),
      yieldTokenIndex: BigNumber.from(2431941),
      depositFromInFlowRate: BigNumber.from(150),
      totalShares: BigNumber.from(170),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    fromUser1Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user1.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    users = [
      {
        name: 'User1',
        result: {
          realTimeBalance: user1RealtimeBalance,
          shares: user1Shares,
          tokenBalance: user1Balance,
        },
        expected: {
          realTimeBalance: BigNumber.from(68638820),
          shares: BigNumber.from(20),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(20)),
        },
      },
      {
        name: 'User2',
        result: {
          realTimeBalance: user2RealtimeBalance,
          shares: user2Shares,
          tokenBalance: user2Balance,
        },
        expected: {
          realTimeBalance: BigNumber.from(401361155),
          shares: BigNumber.from(150),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(150))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
        },
      },
    ];

    await printPeriodTest(periodResult5, periodExpected5, users);

    console.log('\x1b[36m%s\x1b[0m', '#5--- Period Tests passed ');
    console.log('');

    // #endregion FIFTH  PERIOD

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

    // #region ================= SIXTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#6--- User1 deposit 50 units at to + 50');

    await setNextBlockTimestamp(hre, t0 + 50);

    await waitForTx(erc777.send(superPoolTokenAddress, 50, '0x'));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period6: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(830));

    let periodResult6: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period6.inFlowRate,
      yieldAccruedSec: period6.yieldAccruedSec,
      yieldTokenIndex: period6.yieldTokenIndex,
      yieldInFlowRateIndex: period6.yieldInFlowRateIndex,
      depositFromInFlowRate: period6.depositFromInFlowRate,
      deposit: period6.deposit,
      totalShares: period6.totalShares,
    };

    let periodExpected6: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(66837887),
      yieldTokenIndex: BigNumber.from(3320829),
      depositFromInFlowRate: BigNumber.from(200),
      deposit: BigNumber.from(130),
      totalShares: BigNumber.from(330),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);
    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: {
          realTimeBalance: BigNumber.from(295810516),
          shares: BigNumber.from(130),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(130)),
        },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(534189435),
          shares: BigNumber.from(200),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(200))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
        },
      },
    ];

    await printPeriodTest(periodResult6, periodExpected6, users);

    console.log('\x1b[36m%s\x1b[0m', '#6--- Period Tests passed ');
    console.log('');

    // #endregion SIXTH  PERIOD

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

    // #region ================= SEVENTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#7--- Yield accrued changed to 10 units/sec t0 + 60');

    await setNextBlockTimestamp(hre, t0 + 60);

    await waitForTx(superTokenPool.mockYield(10));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period7: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1140));

    let periodResult7: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period7.inFlowRate,
      yieldAccruedSec: period7.yieldAccruedSec,
      yieldTokenIndex: period7.yieldTokenIndex,
      yieldInFlowRateIndex: period7.yieldInFlowRateIndex,
      depositFromInFlowRate: period7.depositFromInFlowRate,
      totalShares: period7.totalShares,
    };

    let periodExpected7: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(78880389),
      yieldTokenIndex: BigNumber.from(3840309),
      depositFromInFlowRate: BigNumber.from(310),
      totalShares: BigNumber.from(440),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: {
          realTimeBalance: BigNumber.from(495597928),
          shares: BigNumber.from(190),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(190)),
        },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(644401945),
          shares: BigNumber.from(250),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(250))
            .sub(BigNumber.from(+fromUser2Stream.deposit)),
        },
      },
    ];

    await printPeriodTest(periodResult7, periodExpected7, users);

    console.log('\x1b[36m%s\x1b[0m', '#7--- Period Tests passed ');
    console.log('');

    // #endregion SEVENTH PERIOD

    /******************************************************************
     *              EIGTH PERIOD (T0 + 70)
     *              User2 reddemflow 4
     *              ---------------------
     *              PoolBalance = 1350 - Flow deposit
     *              PoolShares = 550
     *
     *              PoolDeposit = 130
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

    // #region ================= EIGTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#8--- User2 RedeemFlow 4 untis/Sec t0 + 70');

    await setNextBlockTimestamp(hre, t0 + 70);

    let superTokenPoolUser2 = PoolFactory__factory.connect(superPoolTokenAddress, user2);
    await waitForTx(superTokenPoolUser2.redeemFlow(4));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });

    let period8: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(1350))
      .sub(BigNumber.from(+loanStream.deposit));

    let periodResult8: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period8.inFlowRate,
      outFlowRate: period8.outFlowRate,
      yieldAccruedSec: period8.yieldAccruedSec,
      yieldTokenIndex: period8.yieldTokenIndex,
      yieldInFlowRateIndex: period8.yieldInFlowRateIndex,
      depositFromInFlowRate: period8.depositFromInFlowRate,
      depositFromOutFlowRate: period8.depositFromOutFlowRate,
      totalShares: period8.totalShares,
      outFlowAssetsRate: period8.outFlowAssetsRate,
    };

    let periodExpected8: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(6),
      outFlowRate: BigNumber.from(4),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(85583786),
      yieldTokenIndex: BigNumber.from(4042329),
      depositFromInFlowRate: BigNumber.from(120),
      depositFromOutFlowRate: BigNumber.from(727),
      totalShares: BigNumber.from(550),
      outFlowAssetsRate: BigNumber.from(8),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    expect(+fromUser2Stream.deposit).to.equal(0);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: {
          realTimeBalance: BigNumber.from(622080910),
          shares: BigNumber.from(250),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(250))
            .sub(BigNumber.from(+fromUser1Stream.deposit)),
        },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: { realTimeBalance: BigNumber.from(727000000), shares: BigNumber.from(300), tokenBalance: utils.parseEther('10').sub(BigNumber.from(300)) },
      },
    ];

    await printPeriodTest(periodResult8, periodExpected8, users);

    let user2OutAssets = (await superTokenPool.suppliersByAddress(user2.address)).outAssets.flow.toString();
    let expectedUser2Out = BigNumber.from(8).toString();
    try {
      expect(user2OutAssets).to.equal(BigNumber.from(8));
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#User2 Out-Assets: ${expectedUser2Out}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#$User2 Out-Assets : ${user2OutAssets}, expected:${expectedUser2Out}`);
      console.log(+user2OutAssets.toString() - +expectedUser2Out);
    }

    console.log('\x1b[36m%s\x1b[0m', '#8--- Period Tests passed ');
    console.log('');

    // #endregion EIGTH  PERIOD

    /******************************************************************
     *              NINETH PERIOD (T0 + 80)
     *              User Update stream to 4 units/sec previous 5 units/sex
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
     *              Index Yield Out-Assets = 8880558
     *              ---------------------
     *              User1 Total Balance = 711036360
     *              User1 Total Shares = 310
     *              User2 Total Balance = 718044464
     *              User2 Total Shares = 260
     *              ---------------------
     *
     *              SuperToken Contract
     *              Pool Assest Balance = 50 eth + 1430
     *              User1 Asset Balance = 10 eth - 20  -flowDeposit - 60 - 50 -60 -60 -60
     *              User2 asset Balance = 10 eth  - 300 + 80 -flowDeposit
     *
     *****************************************************************/

    // #region ================= NINETH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#9--- User Update stream to 4 t0 + 80');

    await setNextBlockTimestamp(hre, t0 + 80);

    const operationUpdate = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '4',
      superToken: TOKEN1,
    });

    await operationUpdate.exec(user2);

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period9: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1430));

    let periodResult9: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      deposit: period9.deposit,
      inFlowRate: period9.inFlowRate,
      outFlowRate: period9.outFlowRate,
      yieldAccruedSec: period9.yieldAccruedSec,
      yieldTokenIndex: period9.yieldTokenIndex,
      yieldInFlowRateIndex: period9.yieldInFlowRateIndex,
      yieldOutFlowRateIndex: period9.yieldOutFlowRateIndex,
      depositFromInFlowRate: period9.depositFromInFlowRate,
      depositFromOutFlowRate: period9.depositFromOutFlowRate,
      totalShares: period9.totalShares,
      outFlowAssetsRate: period9.outFlowAssetsRate,
    };

    let periodExpected9: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(777),
      inFlowRate: BigNumber.from(10),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88169101),
      yieldTokenIndex: BigNumber.from(4145741),
      yieldOutFlowRateIndex: BigNumber.from(8880558),
      depositFromInFlowRate: BigNumber.from(180),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(570),
      outFlowAssetsRate: BigNumber.from(0),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: {
          realTimeBalance: BigNumber.from(711036360),
          shares: BigNumber.from(310),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(310))
            .sub(BigNumber.from(+fromUser1Stream.deposit)),
        },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(718044464),
          shares: BigNumber.from(260),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(300))
            .sub(BigNumber.from(+fromUser2Stream.deposit))
            .add(BigNumber.from(80)),
        },
      },
    ];

    await printPeriodTest(periodResult9, periodExpected9, users);

    user2OutAssets = (await superTokenPool.suppliersByAddress(user2.address)).outAssets.flow.toString();
    expectedUser2Out = '0';
    try {
      expect(user2OutAssets).to.equal(expectedUser2Out);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#User2 Out-Assets: ${expectedUser2Out}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#$User2 Out-Assets : ${user2OutAssets}, expected:${expectedUser2Out}`);
      console.log(+user2OutAssets.toString() - +expectedUser2Out);
    }

    console.log('\x1b[36m%s\x1b[0m', '#9--- Period Tests passed ');
    console.log('');

    // #endregion NINETH  PERIOD

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
     *              Index Yield Out-FLOW = 0
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

    // #region ================= TENTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#10--- User2 withdraw 100 units at t0 + 90');

    await setNextBlockTimestamp(hre, t0 + 90);

    await waitForTx(superTokenPoolUser2.redeemDeposit(100));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period10: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1430));

    let periodResult10: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      deposit: period10.deposit,
      inFlowRate: period10.inFlowRate,
      outFlowRate: period10.outFlowRate,
      yieldAccruedSec: period10.yieldAccruedSec,
      yieldTokenIndex: period10.yieldTokenIndex,
      yieldInFlowRateIndex: period10.yieldInFlowRateIndex,
      yieldOutFlowRateIndex: period10.yieldOutFlowRateIndex,
      depositFromInFlowRate: period10.depositFromInFlowRate,
      depositFromOutFlowRate: period10.depositFromOutFlowRate,
      totalShares: period10.totalShares,
      outFlowAssetsRate: period10.outFlowAssetsRate,
    };

    let periodExpected10: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(617),
      inFlowRate: BigNumber.from(10),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(90453112),
      yieldTokenIndex: BigNumber.from(4245045),
      yieldOutFlowRateIndex: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(240),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(570),
      outFlowAssetsRate: BigNumber.from(0),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: {
          realTimeBalance: BigNumber.from(797649946),
          shares: BigNumber.from(370),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(370))
            .sub(BigNumber.from(+fromUser1Stream.deposit)),
        },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(631430196),
          shares: BigNumber.from(200),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(340))
            .sub(BigNumber.from(+fromUser2Stream.deposit))
            .add(BigNumber.from(80))
            .add(BigNumber.from(200)),
        },
      },
    ];

    await printPeriodTest(periodResult10, periodExpected10, users);

    console.log('\x1b[36m%s\x1b[0m', '#10--- Period Tests passed ');
    console.log('');

    // #endregion TENTH  PERIOD

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
     *              Index Yield Out-FLOW = 0
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

    // #region ================= ELEVENTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#11--- User2 stop stream at t0 + 100');

    await setNextBlockTimestamp(hre, t0 + 100);

    const operationDelete = sf.cfaV1.deleteFlow({
      receiver: superPoolTokenAddress,
      sender: user2.address,
      superToken: TOKEN1,
    });

    await operationDelete.exec(user2);

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period11: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1630));

    let periodResult11: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      deposit: period11.deposit,
      inFlowRate: period11.inFlowRate,
      outFlowRate: period11.outFlowRate,
      yieldAccruedSec: period11.yieldAccruedSec,
      yieldTokenIndex: period11.yieldTokenIndex,
      yieldInFlowRateIndex: period11.yieldInFlowRateIndex,
      yieldOutFlowRateIndex: period11.yieldOutFlowRateIndex,
      depositFromInFlowRate: period11.depositFromInFlowRate,
      depositFromOutFlowRate: period11.depositFromOutFlowRate,
      totalShares: period11.totalShares,
      outFlowAssetsRate: period11.outFlowAssetsRate,
    };

    let periodExpected11: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(657),
      inFlowRate: BigNumber.from(6),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(93650465),
      yieldTokenIndex: BigNumber.from(4355298),
      yieldOutFlowRateIndex: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(300),
      depositFromOutFlowRate: BigNumber.from(0),
      totalShares: BigNumber.from(670),
      outFlowAssetsRate: BigNumber.from(0),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: {
          realTimeBalance: BigNumber.from(891166954),
          shares: BigNumber.from(430),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(430))
            .sub(BigNumber.from(+fromUser1Stream.deposit)),
        },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(737912819),
          shares: BigNumber.from(240),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(80)).add(BigNumber.from(200)),
        },
      },
    ];

    await printPeriodTest(periodResult11, periodExpected11, users);

    console.log('\x1b[36m%s\x1b[0m', '#11--- Period Tests passed ');
    console.log('');

    // #endregion ELEVENTH PERIOD

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
     *              Index Yield Out-FLOW = 0
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

  // #region ================= TWELVETH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#12--- User1 redeem flow 5 units at t0 + 110');

    await setNextBlockTimestamp(hre, t0 + 110);

    let superTokenPoolUser1 = PoolFactory__factory.connect(superPoolTokenAddress, user1);
    await waitForTx(superTokenPoolUser1.redeemFlow(5));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user2,
    });

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period12: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1790).sub(+loanStream.deposit));

    let periodResult12: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      deposit: period12.deposit,
      inFlowRate: period12.inFlowRate,
      outFlowRate: period12.outFlowRate,
      yieldAccruedSec: period12.yieldAccruedSec,
      yieldTokenIndex: period12.yieldTokenIndex,
      yieldInFlowRateIndex: period12.yieldInFlowRateIndex,
      yieldOutFlowRateIndex: period12.yieldOutFlowRateIndex,
      depositFromInFlowRate: period12.depositFromInFlowRate,
      depositFromOutFlowRate: period12.depositFromOutFlowRate,
      totalShares: period12.totalShares,
      outFlowAssetsRate: period12.outFlowAssetsRate,
    };

    let periodExpected12: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(527),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(99222906),
      yieldTokenIndex: BigNumber.from(4456615),
      yieldOutFlowRateIndex: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(997),
      totalShares: BigNumber.from(730),
      outFlowAssetsRate: BigNumber.from(10),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: { realTimeBalance: BigNumber.from(997000000), shares: BigNumber.from(490), tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(791306878),
          shares: BigNumber.from(240),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(80)).add(BigNumber.from(200)),
        },
      },
    ];

    await printPeriodTest(periodResult12, periodExpected12, users);

    console.log('\x1b[36m%s\x1b[0m', '#12--- Period Tests passed ');
    console.log('');

  // #endregion TWELVETH PERIOD

      /******************************************************************
     *              THHIRTEENTH  PERIOD (T0 + 120)
     *              User1 redeem flow 5 units
     *              ---------------------
     *              PoolBalance = 1790 -flow deposit
     *              PoolShares = 680
     *
     *              PoolDeposit = 397
     *              Pool InFlow = 0 unitd/se8
     *              Pool OutFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4524457
     *              Index Yield In-FLOW =  99222906
     *              Index Yield Out-FLOW = 6424695
     *              ---------------------
     *              User1 Total Balance = 961246940
     *              User1 Total Shares = 440
     *              User2 Total Balance = 827059612
     *              User2 Total Shares = 240
     *              User3 Tola Balalnce = 100
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

  // #region ================= THHIRTEENTH  PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#13--- User2 transfer to user3 50 units');

    await setNextBlockTimestamp(hre, t0 + 120);

    erc20 = await ERC20__factory.connect(superPoolTokenAddress, user2)
    await waitForTx(erc20.transfer(user3.address,50))

    // await waitForTx(superTokenPool.mockPoolUpdate())

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);


    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period13: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1790).sub(+loanStream.deposit));

    let periodResult13: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      deposit: period13.deposit,
      inFlowRate: period13.inFlowRate,
      outFlowRate: period13.outFlowRate,
      yieldAccruedSec: period13.yieldAccruedSec,
      yieldTokenIndex: period13.yieldTokenIndex,
      yieldInFlowRateIndex: period13.yieldInFlowRateIndex,
      yieldOutFlowRateIndex: period13.yieldOutFlowRateIndex,
      depositFromInFlowRate: period13.depositFromInFlowRate,
      depositFromOutFlowRate: period13.depositFromOutFlowRate,
      totalShares: period13.totalShares,
      outFlowAssetsRate: period13.outFlowAssetsRate,
    };

    let periodExpected13: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(527),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(99222906),
      yieldTokenIndex: BigNumber.from(4524457),
      yieldOutFlowRateIndex: BigNumber.from(6424694),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(897),
      totalShares: BigNumber.from(680),
      outFlowAssetsRate: BigNumber.from(10),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);
    let user3RealtimeBalance = await superTokenPool.totalBalanceSupplier(user3.address);

    user1Shares = await superTokenPool.balanceOf(user1.address);
    user2Shares = await superTokenPool.balanceOf(user2.address);
    let user3Shares = await superTokenPool.balanceOf(user3.address);

    user1Balance = await tokenContract.balanceOf(user1.address);
    user2Balance = await tokenContract.balanceOf(user2.address);
    user3Balance = await tokenContract.balanceOf(user3.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance, shares: user1Shares, tokenBalance: user1Balance },
        expected: { realTimeBalance: BigNumber.from(861246940), shares: BigNumber.from(390), 
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)).add(BigNumber.from(100)) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance, shares: user2Shares, tokenBalance: user2Balance },
        expected: {
          realTimeBalance: BigNumber.from(827059612),
          shares: BigNumber.from(240),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(80)).add(BigNumber.from(200)),
        },
      },
      {
        name: 'User3',
        result: { realTimeBalance: user3RealtimeBalance, shares: user3Shares, tokenBalance: user3Balance },
        expected: {
          realTimeBalance: BigNumber.from(100),
          shares: BigNumber.from(50),
          tokenBalance: utils.parseEther('10'),
        },
      },
    ];

    await printPeriodTest(periodResult13, periodExpected13, users);



    console.log('\x1b[36m%s\x1b[0m', '#13--- Period Tests passed ');
    console.log('');

    // #endregion THHIRTEENTH PERIOD
  });
});
