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
import { Framework, IWeb3FlowInfo } from '@superfluid-finance/sdk-core';

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

let provider: BaseProvider;
let eventsLib: any;
let sf: Framework;
let t0: number;

let erc777: ERC777;
let superPoolTokenAddress: string;
let superPoolBalance: number

let loanStream:IWeb3FlowInfo;

describe('Use case Stream test', function () {
  beforeEach(async () => {
    [deployer, user1, user2] = await initEnv(hre);
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

    console.log(85,parseInt(await getTimestamp()));

    superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(TOKEN1);

    superTokenPool = PoolFactory__factory.connect(superPoolTokenAddress, deployer);

    tokenContract.approve(superPoolTokenAddress,hre.ethers.constants.MaxUint256);


    sf = await Framework.create({
      networkName: 'local',
      provider: provider,
      customSubgraphQueriesEndpoint: 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-mumbai',
      resolverAddress: '0x8C54C83FbDe3C59e59dd6E324531FB93d4F504d3',
    });

    let user2Balance = await tokenContract.balanceOf(user2.address);

    await tokenContract.transfer(superPoolTokenAddress, utils.parseEther('50'));

    if (user2Balance.toString() == '0') {
      await tokenContract.transfer(user1.address, utils.parseEther('500'));
      await tokenContract.transfer(user2.address, utils.parseEther('500'));
    }

    superPoolBalance = +(await tokenContract.balanceOf(superPoolTokenAddress)).toString();

    t0 = parseInt(await getTimestamp());
    console.log(t0);
  });

  it('should be successfull', async function () {
    /******************************************************************
     *              FIRST PERIOD (T0)
     *              USER1  start stream 10 m/S
     *              ---------------------
     *              PoolBalance = 20
     *              User1Balance = 20
     *
     *****************************************************************/
    console.log('\x1b[36m%s\x1b[0m', '#1---  start stream 10 m/S t0 ');
    console.log(parseInt(await getTimestamp()));
    erc777 = await ERC777__factory.connect(TOKEN1, user1);

    let createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '20',
      superToken: TOKEN1,
    });
    await createFlowOperation.exec(user1);
    console.log(133);
    console.log(parseInt(await getTimestamp()));

    let superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let expedtedPoolBalance = utils.parseEther('50');

    let period1:IPERIOD_RESULT = await getPeriod(superTokenPool);

    let periodResult1: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      deposit: period1.deposit,
      inFlowRate:period1.inFlowRate,
      depositFromInFlowRate: period1.depositFromInFlowRate
    };

    let periodExpected1: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit:BigNumber.from(0),
      inFlowRate:BigNumber.from(10),
      depositFromInFlowRate: BigNumber.from(0)
    };

    let user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);

    let users: Array<IUSER_CHECK> = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(0) },
      },
    ];
    console.log(parseInt(await getTimestamp()));
    await printPeriodTest(periodResult1, periodExpected1, users);

    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tested #######');
    console.log('');

    await setNextBlockTimestamp(hre, t0 + 10);

    console.log(parseInt(await getTimestamp()));

    /******************************************************************
     *              SECOND PERIOD (T0 + 10)
     *              User2 start stream 5 uints/sec
     *              ---------------------
     *              PoolBalance = 100
     *              Pool InFlow = 5 unitd/sec
     *              User1Balance = 100
     *              User2Balance = 0
     *
     *****************************************************************/
    console.log('\x1b[36m%s\x1b[0m', '#2--- User2 provides starts a stream 5 units/sec at t0 + 10 ');
    console.log(186,parseInt(await getTimestamp()));
     createFlowOperation = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '5',
      superToken: TOKEN1,
    });
    await createFlowOperation.exec(user2);

    console.log(194,parseInt(await getTimestamp()));

    let period2: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50');

    let periodResult2: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period2.inFlowRate,
      depositFromInFlowRate: period2.depositFromInFlowRate,
      deposit:period2.deposit
    };

    let periodExpected2: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(15),
      depositFromInFlowRate: BigNumber.from(100),
      deposit:BigNumber.from(0)
    };

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    let user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(0) },
      },
    ];

    await printPeriodTest(periodResult2, periodExpected2);

    await printPeriod(superTokenPool,t0)

    console.log('\x1b[36m%s\x1b[0m', '#2--- Period Tests passed ');
    console.log('');

    throw new Error("");
    

    /******************************************************************
     *              THIRD PERIOD (T0 + 20)
     *              Yield Start Accrued 10 units/second
     *              ---------------------
     *              PoolBalance = 70
     *              Pool InFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 10
     *              User1Balance = 20
     *              User2Balance = 50
     *
     *****************************************************************/

    // #region ================= THIRD PERIOD ============================= //

    await setNextBlockTimestamp(hre, t0 + 20);

    console.log('\x1b[36m%s\x1b[0m', '#3--- Pool accred 10 units/sec at t0 + 20');
    await waitForTx(superTokenPool.mockYield(10));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period3: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(70));

    let periodResult3: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period3.inFlowRate,
      yieldAccruedSec: period3.yieldAccruedSec,
    };

    let periodExpected3: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);
    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(5).mul(10) },
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
     *              Pool InFlow = 5 unitd/sec
     *              Yield Accrued units/sec = 20
     *              User1Balance = 20
     *              User2Balance = 50
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
      yieldAccruedSec: period4.yieldAccruedSec,
      yieldTokenIndex:period4.yieldTokenIndex,
      yieldInFlowRateIndex:period4.yieldInFlowRateIndex
    };

    let periodExpected4: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(15789473),
      yieldTokenIndex: BigNumber.from(1052631)
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

  

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(5).mul(20) },
      },
    ];

  

    await printPeriodTest(periodResult4, periodExpected4);

    console.log('\x1b[36m%s\x1b[0m', '#4--- Period Tests passed ');
    console.log('');

    await setNextBlockTimestamp(hre, t0 + 40);

    // #endregion FOURTH PERIOD

    /******************************************************************
     *              FIFTH PERIOD (T0 + 40)
     *              User1 start stream 6 units/second
     *              ---------------------
     *              PoolBalance = 470
     *              Pool InFlow = 11 unitd/sec
     *              Yield Accrued units/sec = 20
     *              User1Balance = 20
     *              User2Balance = 50
     *
     *****************************************************************/

    // #region ================= FIFTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#5--- USser 1 start stream 6 units/sec at t0 + 40');
 
    
    const operation = sf.cfaV1.createFlow({
      receiver: superTokenPool.address,
      flowRate: "6",
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
      yieldTokenIndex:period5.yieldTokenIndex,
      yieldInFlowRateIndex:period5.yieldInFlowRateIndex,
      depositFromInFlowRate:period5.depositFromInFlowRate
    };

    let periodExpected5: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(50272231),
      yieldTokenIndex: BigNumber.from(2431941),
      depositFromInFlowRate: BigNumber.from(150)
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    let user1yield =   await superTokenPool.totalYieldEarnedSupplier(user2.address);
    console.log(391,user1yield.toString())

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(5).mul(20) },
      },
    ];


    await printPeriodTest(periodResult5, periodExpected5);

    console.log('\x1b[36m%s\x1b[0m', '#5--- Period Tests passed ');
    console.log('');

 

    // #endregion FIFTH  PERIOD

    
    /******************************************************************
     *              SIXTH PERIOD (T0 + 50)
     *              User1 deposit 50 units
     *              ---------------------
     *              PoolBalance = 830
     *              PoolDeposit = 70
     *              Pool InFlow = 11 unitd/sec
     *              Yield Accrued units/sec = 20
     *              Index Yield Token = 3320829
     *              Index Yield In-FLOW = 66837887
     *              ---------------------
     *              User1Balance = 20
     *              User2Balance = 50
     *              
     *
     *****************************************************************/

    // #region ================= SIXTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#6--- USser 1 start stream 6 units/sec at t0 + 50');
 
    await setNextBlockTimestamp(hre, t0 + 50);

    await waitForTx(erc777.send(superPoolTokenAddress, 50, '0x'));


    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    let period6: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(830));

    let periodResult6: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period6.inFlowRate,
      yieldAccruedSec: period6.yieldAccruedSec,
      yieldTokenIndex:period6.yieldTokenIndex,
      yieldInFlowRateIndex:period6.yieldInFlowRateIndex,
      depositFromInFlowRate:period6.depositFromInFlowRate
    };

    let periodExpected6: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(66837887),
      yieldTokenIndex: BigNumber.from(3320829),
      depositFromInFlowRate: BigNumber.from(260)
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1yield =   await superTokenPool.totalYieldEarnedSupplier(user2.address);
    console.log(474,user1yield.toString())

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(5).mul(20) },
      },
    ];


    await printPeriodTest(periodResult6, periodExpected6);

    console.log('\x1b[36m%s\x1b[0m', '#6--- Period Tests passed ');
    console.log('');

    // #endregion SIXTH  PERIOD

    /******************************************************************
     *              SEVENTH PERIOD (T0 + 60)
     *              Yield accrued to 10 units/sec
     *              ---------------------
     *              PoolBalance = 1140
     *              PoolDeposit = 70
     *              Pool InFlow = 11 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 3840309
     *              Index Yield In-FLOW = 81713920
     *              ---------------------
     *              User1Balance = 20
     *              User2Balance = 50
     *              
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
      yieldTokenIndex:period7.yieldTokenIndex,
      yieldInFlowRateIndex:period7.yieldInFlowRateIndex,
      depositFromInFlowRate:period7.depositFromInFlowRate
    };

    let periodExpected7: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(11),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(81713920),
      yieldTokenIndex: BigNumber.from(3840309),
      depositFromInFlowRate: BigNumber.from(370)
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1yield =   await superTokenPool.totalYieldEarnedSupplier(user2.address);
    console.log(474,user1yield.toString())

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(5).mul(20) },
      },
    ];


    await printPeriodTest(periodResult7, periodExpected7);

    console.log('\x1b[36m%s\x1b[0m', '#7--- Period Tests passed ');
    console.log('');

    // #endregion SEVENTH PERIOD

    /******************************************************************
     *              EIGTH PERIOD (T0 + 70)
     *              User1 Withdraw start stream 9
     *              ---------------------
     *              PoolBalance = 1350 - Flow deposit
     *              PoolDeposit = 70
     *              Pool InFlow = 11 unitd/sec
     *              Pool OutFlow = 9 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4042329
     *              Index Yield In-FLOW = 89519245
     *              ---------------------
     *              User1Balance = 20
     *              User2Balance = 50
     *              
     *
     *****************************************************************/

    // #region ================= EIGTH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#8--- Yield accrued changed to 10 units/sec t0 + 70');
 
    await setNextBlockTimestamp(hre, t0 + 70);

    

    let superTokenPoolUser2 =  PoolFactory__factory.connect(superPoolTokenAddress,user2 )
    await waitForTx(superTokenPoolUser2.withdrawStreamStart(9));

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

 loanStream = await sf.cfaV1.getFlow({
      superToken: TOKEN1,
      sender:superPoolTokenAddress ,
      receiver: user2.address,
      providerOrSigner: user2,
    });
  
    console.log(loanStream.deposit)


    let period8: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1350)).sub(BigNumber.from(+loanStream.deposit));



    let periodResult8: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      inFlowRate: period8.inFlowRate,
      outFlowRate:period8.outFlowRate,
      yieldAccruedSec: period8.yieldAccruedSec,
      yieldTokenIndex:period8.yieldTokenIndex,
      yieldInFlowRateIndex:period8.yieldInFlowRateIndex,
      depositFromInFlowRate:period8.depositFromInFlowRate,
      depositFromOutFlowRate:period8.depositFromOutFlowRate
    };

    let periodExpected8: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      inFlowRate: BigNumber.from(6),
      outFlowRate: BigNumber.from(4),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(89519245),
      yieldTokenIndex: BigNumber.from(4042329),
      depositFromInFlowRate: BigNumber.from(180),
      depositFromOutFlowRate:BigNumber.from(747)
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1yield =   await superTokenPool.totalYieldEarnedSupplier(user2.address);
    console.log(474,user1yield.toString())

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(5).mul(20) },
      },
    ];


    await printPeriodTest(periodResult8, periodExpected8);



    console.log('\x1b[36m%s\x1b[0m', '#8--- Period Tests passed ');
    console.log('');

    // #endregion EIGTH  PERIOD


    /******************************************************************
     *              NINETH PERIOD (T0 + 80)
     *              User Update stream to 13 units/sec previous 5 units/sex
     *              ---------------------
     *              PoolBalance = 1510 - outstream balance
     *              PoolDeposit = 70
     *              Pool InFlow = 19 unitd/se8
     *              Pool OutFlow = 9 unitd/sec
     *              Yield Accrued units/sec = 10
     *              Index Yield Token = 4141633
     *              Index Yield In-FLOW = 92994915
     *              Index Yield Out-FLOW = 18048659
     *              ---------------------
     *              User1Balance = 20
     *              User2Balance = 50
     *              
     *
     *****************************************************************/

    // #region ================= NINETH PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#9--- User Update stream to 13 units/sec previous 5 units/sex t0 + 80');
 
    await setNextBlockTimestamp(hre, t0 + 80);

    

    const operationUpdate = sf.cfaV1.updateFlow({
      receiver: superPoolTokenAddress,
      flowRate: "13",
      superToken: TOKEN1,
    });
  
    await operationUpdate.exec(user2);

    superPoolBalance = await supertokenContract.realtimeBalanceOfNow(superPoolTokenAddress);

    loanStream = await sf.cfaV1.getFlow({
          superToken: TOKEN1,
          sender:superPoolTokenAddress ,
          receiver: user2.address,
          providerOrSigner: user2,
        });
  
    console.log(loanStream.deposit)


    let period9: IPERIOD = await getPeriod(superTokenPool);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1470)).sub(BigNumber.from(+loanStream.deposit));



    let periodResult9: IPERIOD_RESULT = {
      poolTotalBalance: superPoolBalance.availableBalance,
      deposit:period9.deposit,
      inFlowRate: period9.inFlowRate,
      outFlowRate:period9.outFlowRate,
      yieldAccruedSec: period9.yieldAccruedSec,
      yieldTokenIndex:period9.yieldTokenIndex,
      yieldInFlowRateIndex:period9.yieldInFlowRateIndex,
      yieldOutFlowRateIndex:period9.yieldOutFlowRateIndex,
      depositFromInFlowRate:period9.depositFromInFlowRate,
      depositFromOutFlowRate:period9.depositFromOutFlowRate
    };

    let periodExpected9: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit:BigNumber.from(777),
      inFlowRate: BigNumber.from(10),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(92994915),
      yieldTokenIndex: BigNumber.from(4141633),
      yieldOutFlowRateIndex:BigNumber.from(18048659),
      depositFromInFlowRate: BigNumber.from(240),
      depositFromOutFlowRate:BigNumber.from(0)
    };

    ///////////// User1 balance

    user1RealtimeBalance = await superTokenPool.totalBalanceSupplier(user1.address);
    user2RealtimeBalance = await superTokenPool.totalBalanceSupplier(user2.address);

    user1yield =   await superTokenPool.totalYieldEarnedSupplier(user2.address);
    console.log(474,user1yield.toString())

    users = [
      {
        name: 'User1',
        result: { realTimeBalance: user1RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(20) },
      },
      {
        name: 'User2',
        result: { realTimeBalance: user2RealtimeBalance },
        expected: { realTimeBalance: BigNumber.from(5).mul(20) },
      },
    ];


    await printPeriodTest(periodResult9, periodExpected9);



    console.log('\x1b[36m%s\x1b[0m', '#9--- Period Tests passed ');
    console.log('');

    // #endregion NINETH  PERIOD


  });
});
