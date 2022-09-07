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
  PoolFactoryV1,
  PoolFactoryV1__factory,
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
let poolFactory: PoolFactoryV1;
let superTokenPool: PoolFactoryV1;
let supertokenContract: ISuperfluidToken;
let tokenContract: ERC777;
let contractsTest: any;

let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let SUPERTOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let TOKEN1 = '0x15F0Ca26781C3852f8166eD2ebce5D18265cceb7'

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

describe('TOKEN Use case test', function () {
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

    poolFactory = await new PoolFactoryV1__factory(deployer).deploy();

    eventsLib = await new Events__factory(deployer).deploy();

    supertokenContract = await ISuperfluidToken__factory.connect(SUPERTOKEN1, deployer);
    tokenContract = await ERC777__factory.connect(SUPERTOKEN1, deployer);

    let superInputStruct: SuperPoolInputStruct = {
      poolFactory: poolFactory.address,
      superToken: SUPERTOKEN1,
      ops: GELATO_OPS,
      token: TOKEN1
    };
    await superPoolHost.createSuperPool(superInputStruct);

    superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(SUPERTOKEN1);

    superTokenPool = PoolFactoryV1__factory.connect(superPoolTokenAddress, deployer);


    let initialPoolEth = hre.ethers.utils.parseEther('10');

    let balance = await provider.getBalance(superPoolTokenAddress);

    await deployer.sendTransaction({ to: superPoolTokenAddress, value: initialPoolEth });

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
      superToken: SUPERTOKEN1,
    });
    await authOperation.exec(user2);

    erc20 = await ERC20__factory.connect(SUPERTOKEN1, user2);
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

    erc777 = await ERC777__factory.connect(SUPERTOKEN1, user1);

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
      superToken: SUPERTOKEN1,
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
      superToken: SUPERTOKEN1,
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
      superToken: SUPERTOKEN1,
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
      superToken: SUPERTOKEN1,
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

    let superTokenPoolUser2 = PoolFactoryV1__factory.connect(superPoolTokenAddress, user2);
    await waitForTx(superTokenPoolUser2.redeemFlow(4,0));

    loanStream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
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
      superToken: SUPERTOKEN1,
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

    console.log('\x1b[36m%s\x1b[0m', '#9--- User2 Update stream to 4 t0 + 80');

    const operationUpdate = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '4',
      superToken: SUPERTOKEN1,
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
      superToken: SUPERTOKEN1,
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

    console.log('\x1b[36m%s\x1b[0m', '#10--- User2 withdraw 100 units at t0 + 90');

    await waitForTx(superTokenPoolUser2.redeemDeposit(100));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1369));

    let periodExpected10: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(815129676),
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
          realTimeBalance: BigNumber.from(504),
          shares: BigNumber.from(200),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(340))
            .sub(BigNumber.from(+fromUser2Stream.deposit))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251)),
          deposit: BigNumber.from(504596589),
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
      superToken: SUPERTOKEN1,
    });

    await operationDelete.exec(user2);

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1569));

    let periodExpected11: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(911285611),
      inFlowRate: BigNumber.from(6),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(83826023),
      yieldTokenIndex: BigNumber.from(3929632),
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
          realTimeBalance: BigNumber.from(968),
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
          realTimeBalance: BigNumber.from(600),
          shares: BigNumber.from(240),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(600752524),
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

    console.log('\x1b[36m%s\x1b[0m', '#12--- User1 redeem flow 5 units at t0 + 110');

    let superTokenPoolUser1 = PoolFactoryV1__factory.connect(superPoolTokenAddress, user1);
    await waitForTx(superTokenPoolUser1.redeemFlow(5,0));

    loanStream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1729).sub(+loanStream.deposit));

    let periodExpected12: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(600752524),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88256912),
      yieldTokenIndex: BigNumber.from(4010193),
      yieldOutFlowRateIndex: BigNumber.from(6461589),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(1079848270),

      totalShares: BigNumber.from(730),
      outFlowAssetsRate: BigNumber.from(11),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1079),
          shares: BigNumber.from(490),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(490)),
          deposit: BigNumber.from(1079848270),
          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(5),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(110),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(649),
          shares: BigNumber.from(240),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(600752524),
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

    console.log('\x1b[36m%s\x1b[0m', '#13--- User2 transfer to user3 50 units');

    erc20 = await ERC20__factory.connect(superPoolTokenAddress, user2);
    await waitForTx(erc20.transfer(user3.address, 50));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1719).sub(+loanStream.deposit));

    let periodExpected13: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(686105039),

      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(5),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88256912),
      yieldTokenIndex: BigNumber.from(4071708),
      yieldOutFlowRateIndex: BigNumber.from(12192886),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(969848270),
      totalShares: BigNumber.from(680),
      outFlowAssetsRate: BigNumber.from(11),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1032),
          shares: BigNumber.from(440),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)),
          deposit: BigNumber.from(969848270),

          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(5),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(110),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(544),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          realTimeBalance: BigNumber.from(142),
          shares: BigNumber.from(50),
          tokenBalance: utils.parseEther('10'),
          deposit: BigNumber.from(142000000),
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

    console.log('\x1b[36m%s\x1b[0m', '#14--- User1 stop redeemflow');

    erc20 = await ERC20__factory.connect(superPoolTokenAddress, user2);

    await waitForTx(superTokenPoolUser1.redeemFlowStop());

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1709));

    let periodExpected14: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1666141542),

      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88256912),
      yieldTokenIndex: BigNumber.from(4134170),
      yieldOutFlowRateIndex: BigNumber.from(17387792),
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
          realTimeBalance: BigNumber.from(980),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(578),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          deposit: BigNumber.from(142000000),
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

    console.log('\x1b[36m%s\x1b[0m', '#15--- User3 redeem 15 shares');

    let superTokenPoolUser3 = await superTokenPool.connect(user3);

    await waitForTx(superTokenPoolUser3.redeemDeposit(15));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1762));

    let periodExpected15: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1636533702),

      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88256912),
      yieldTokenIndex: BigNumber.from(4194188),
      yieldOutFlowRateIndex: BigNumber.from(17387792),
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
          realTimeBalance: BigNumber.from(1038),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(610),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          realTimeBalance: BigNumber.from(112),
          shares: BigNumber.from(35),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(47)),
          deposit: BigNumber.from(112392160),
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

    console.log('\x1b[36m%s\x1b[0m', '#16--- User3 start stream 5 supertokens/ss');

    const operationUser3create = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '5',
      superToken: SUPERTOKEN1,
    });

    await operationUser3create.exec(user3);

    fromUser3Stream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: user3.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(1862));

    let periodExpected16: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1643401312),
      inFlowRate: BigNumber.from(5),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88256912),
      yieldTokenIndex: BigNumber.from(4255292),
      yieldOutFlowRateIndex: BigNumber.from(17387792),
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
          realTimeBalance: BigNumber.from(1098),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(643),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          realTimeBalance: BigNumber.from(119),
          shares: BigNumber.from(35),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(47))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(119259770),
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

    console.log('\x1b[36m%s\x1b[0m', '#17--- User3 update stream to 3 supertokens/s');

    const operationUser3update = sf.cfaV1.updateFlow({
      receiver: superPoolTokenAddress,
      flowRate: '3',
      superToken: SUPERTOKEN1,
    });

    await operationUser3update.exec(user3);

    fromUser3Stream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: user3.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(2012));

    let periodExpected17: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1702047824),
      inFlowRate: BigNumber.from(3),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88556600),
      yieldTokenIndex: BigNumber.from(4315229),
      yieldOutFlowRateIndex: BigNumber.from(17387792),
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
          realTimeBalance: BigNumber.from(1157),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(676),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          realTimeBalance: BigNumber.from(177),
          shares: BigNumber.from(85),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(47))
            .sub(BigNumber.from(50))
            .sub(+fromUser3Stream.deposit),
          deposit: BigNumber.from(177906282),
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

    console.log('\x1b[36m%s\x1b[0m', '#18--- User3 redeemfloe 2 supertokens/s');

    await waitForTx(superTokenPoolUser3.redeemFlow(2,0));

    loanStream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user3.address,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2142))
      .sub(+loanStream.deposit);

    let periodExpected18: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1524141542),

      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(2),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88847797),
      yieldTokenIndex: BigNumber.from(4373468),
      yieldOutFlowRateIndex: BigNumber.from(17387792),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(219140956),
      totalShares: BigNumber.from(695),
      outFlowAssetsRate: BigNumber.from(3),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1214),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(708),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          realTimeBalance: BigNumber.from(219),
          shares: BigNumber.from(115),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(47)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(219140956),
          outAssets: BigNumber.from(3),
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

    console.log('\x1b[36m%s\x1b[0m', '#19--- User3 update redeemfloe to 4 supertokens/s');

    await waitForTx(superTokenPoolUser3.redeemFlow(4,0));

    loanStream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user3.address,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2212))
      .sub(+loanStream.deposit);

    let periodExpected19: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1524141542),

      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(4),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(88847797),
      yieldTokenIndex: BigNumber.from(4431328),
      yieldOutFlowRateIndex: BigNumber.from(21325052),

      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(200952736),
      totalShares: BigNumber.from(675),
      outFlowAssetsRate: BigNumber.from(8),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1271),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(739),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          realTimeBalance: BigNumber.from(200),
          shares: BigNumber.from(95),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(77)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(200952736),
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

    console.log('\x1b[36m%s\x1b[0m', '#20---- yield accrued 20/units second');

    await waitForTx(superTokenPool.mockYield(20));

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2232))
      .sub(+loanStream.deposit);

    let periodExpected20: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1524141542),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(4),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(88847797),
      yieldTokenIndex: BigNumber.from(4490671),
      yieldOutFlowRateIndex: BigNumber.from(22518996),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(120952736),
      totalShares: BigNumber.from(635),
      outFlowAssetsRate: BigNumber.from(8),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1329),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(772),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          realTimeBalance: BigNumber.from(130),
          shares: BigNumber.from(55),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(157)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(120952736),
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

    console.log('\x1b[36m%s\x1b[0m', '#21---- user3 redeem flow updated to 1');

    await waitForTx(superTokenPoolUser3.redeemFlow(1,0));

    loanStream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user3.address,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .add(BigNumber.from(2352))
      .sub(+loanStream.deposit);

    let periodExpected21: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1524141542),
      inFlowRate: BigNumber.from(0),
      outFlowRate: BigNumber.from(1),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(88847797),
      yieldTokenIndex: BigNumber.from(4615274),

      yieldOutFlowRateIndex: BigNumber.from(23779867),

      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(60591256),

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
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(839),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
          tokenBalance: utils.parseEther('10').add(BigNumber.from(237)).sub(BigNumber.from(80)),
          deposit: BigNumber.from(60591256),

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

    // #endregion 21st PERIOD

    await setNextBlockTimestamp(hre, t0 + 210);

    // #region ================= 22nd PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#22---- user3 start stream 5 token/sec');

    const operationUser3Create21 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '5',
      superToken: SUPERTOKEN1,
    });

    await operationUser3Create21.exec(user3);

    fromUser3Stream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: user3.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user3,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(2512));

    let periodExpected22: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1549921062),

      inFlowRate: BigNumber.from(5),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(88847797),
      yieldTokenIndex: BigNumber.from(4743091),

      yieldOutFlowRateIndex: BigNumber.from(25076933),

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
          realTimeBalance: BigNumber.from(1576),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(909),
          shares: BigNumber.from(190),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(380)).add(BigNumber.from(90)).add(BigNumber.from(251)),
          deposit: BigNumber.from(544105039),

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
            .add(BigNumber.from(277))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(80)),
          deposit: BigNumber.from(25779520),
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

    console.log('\x1b[36m%s\x1b[0m', '#23---- user2 start stream 7 token/sec');

    const operationUser2Create23 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '7',
      superToken: SUPERTOKEN1,
    });

    await operationUser2Create23.exec(user2);

    fromUser2Stream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: user2.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(2762));

    let periodExpected23: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(1984319834),
      inFlowRate: BigNumber.from(12),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(89482749),
      yieldTokenIndex: BigNumber.from(4870081),
      yieldOutFlowRateIndex: BigNumber.from(25076933),

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
          realTimeBalance: BigNumber.from(1701),
          shares: BigNumber.from(390),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(980036503),
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
          realTimeBalance: BigNumber.from(978),
          shares: BigNumber.from(190),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(380))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251)),
          deposit: BigNumber.from(978503811),
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
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(80)),
          deposit: BigNumber.from(25779520),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(210),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 220, periodExpected23, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#23--- Period Tests passed ');
    console.log('');

    // #endregion 23rd PERIOD

    await setNextBlockTimestamp(hre, t0 + 230);

    // #region ================= 24th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#24--- User1 transfer to user2 100 units');

    erc20 = await ERC20__factory.connect(superPoolTokenAddress, user1);
    await waitForTx(erc20.transfer(user2.address, 100));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(3082));

    let periodExpected24: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(2968699922),
      inFlowRate: BigNumber.from(12),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(90358132),
      yieldTokenIndex: BigNumber.from(4965577),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
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
          realTimeBalance: BigNumber.from(1334),
          shares: BigNumber.from(290),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(270)),
          deposit: BigNumber.from(1334845711),
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
          realTimeBalance: BigNumber.from(1608),
          shares: BigNumber.from(360),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(450))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251)),
          deposit: BigNumber.from(1608074691),
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
          realTimeBalance: BigNumber.from(139),
          shares: BigNumber.from(105),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(130)),
          deposit: BigNumber.from(25779520),
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

    await setNextBlockTimestamp(hre, t0 + 240);

    // #region ================= 25th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#25--- User1 in stream 3');

    const operationUser1Create25 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '3',
      superToken: SUPERTOKEN1,
    });

    await operationUser1Create25.exec(user1);

    fromUser1Stream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: user1.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user1,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(3402));

    let periodExpected25: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3054028599),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(91210456),
      yieldTokenIndex: BigNumber.from(5029501),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
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
          realTimeBalance: BigNumber.from(1420),
          shares: BigNumber.from(290),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(270)),
          deposit: BigNumber.from(1420174388),

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
          realTimeBalance: BigNumber.from(1786),
          shares: BigNumber.from(430),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(520))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251)),
          deposit: BigNumber.from(1608074691),
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
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(180)),
          deposit: BigNumber.from(25779520),
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

    console.log('\x1b[36m%s\x1b[0m', '#26--- yield accrued 1o units/sec');

    await waitForTx(superTokenPool.mockYield(10));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(3752));

    let periodExpected26: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3054028599),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(92384925),
      yieldTokenIndex: BigNumber.from(5089219),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
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
          realTimeBalance: BigNumber.from(1538),
          shares: BigNumber.from(320),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(300)),
          deposit: BigNumber.from(1420174388),

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
          realTimeBalance: BigNumber.from(1961),
          shares: BigNumber.from(500),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(590))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251)),
          deposit: BigNumber.from(1608074691),
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
          realTimeBalance: BigNumber.from(252),
          shares: BigNumber.from(205),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(230)),
          deposit: BigNumber.from(25779520),
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

    console.log('\x1b[36m%s\x1b[0m', '#27--- user4 stream 10 units/sec');

    const operationUser4Create27 = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: '10',
      superToken: SUPERTOKEN1,
    });

    await operationUser4Create27.exec(user4);

    fromUser4Stream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: user4.address,
      receiver: superPoolTokenAddress,
      providerOrSigner: user4,
    });

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(4002));

    let periodExpected27: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3054028599),
      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(10),
      yieldInFlowRateIndex: BigNumber.from(93232779),
      yieldTokenIndex: BigNumber.from(5117798),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
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
          realTimeBalance: BigNumber.from(1611),
          shares: BigNumber.from(350),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(330)),
          deposit: BigNumber.from(1420174388),

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
          realTimeBalance: BigNumber.from(2082),
          shares: BigNumber.from(570),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(660))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251)),
          deposit: BigNumber.from(1608074691),
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
          realTimeBalance: BigNumber.from(307),
          shares: BigNumber.from(255),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(280)),
          deposit: BigNumber.from(25779520),
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
          tokenBalance: utils.parseEther('10').sub(+fromUser4Stream.deposit),
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

    console.log('\x1b[36m%s\x1b[0m', '#28--- mock yield 20 units/sec');

    await waitForTx(superTokenPool.mockYield(20));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(4352));

    let periodExpected28: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3054028599),
      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(93930259),
      yieldTokenIndex: BigNumber.from(5144832),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
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
          realTimeBalance: BigNumber.from(1682),
          shares: BigNumber.from(380),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(360)),
          deposit: BigNumber.from(1420174388),

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
          realTimeBalance: BigNumber.from(2201),
          shares: BigNumber.from(640),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(730))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251)),
          deposit: BigNumber.from(1608074691),
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
          realTimeBalance: BigNumber.from(361),
          shares: BigNumber.from(305),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(330)),
          deposit: BigNumber.from(25779520),
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

    console.log('\x1b[36m%s\x1b[0m', '#29--- user2 redeems 250');

    await waitForTx(superTokenPoolUser2.redeemDeposit(250));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(3970));

    let periodExpected29: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(2979421587),

      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(95743363),
      yieldTokenIndex: BigNumber.from(5195477),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
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
          realTimeBalance: BigNumber.from(1789),
          shares: BigNumber.from(410),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(390)),
          deposit: BigNumber.from(1420174388),

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
          realTimeBalance: BigNumber.from(1533),
          shares: BigNumber.from(460),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(800))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251))
            .add(BigNumber.from(832)),
          deposit: BigNumber.from(1533467679),
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
          realTimeBalance: BigNumber.from(421),
          shares: BigNumber.from(355),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(380)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(225),
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

    let erc777User4 = await ERC777__factory.connect(SUPERTOKEN1, user4);

    await waitForTx(erc777User4.send(superPoolTokenAddress, 300, '0x'));

    expedtedPoolBalance = utils.parseEther('50').add(BigNumber.from(4720));

    let periodExpected30: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(3621377687),

      inFlowRate: BigNumber.from(25),
      outFlowRate: BigNumber.from(0),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(97428389),
      yieldTokenIndex: BigNumber.from(5248465),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
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
          realTimeBalance: BigNumber.from(1899),
          shares: BigNumber.from(440),
          tokenBalance: utils
            .parseEther('10')
            .sub(+fromUser1Stream.deposit)
            .sub(BigNumber.from(420)),
          deposit: BigNumber.from(1420174388),

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
          realTimeBalance: BigNumber.from(1696),
          shares: BigNumber.from(530),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(870))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251))
            .add(BigNumber.from(832)),
          deposit: BigNumber.from(1533467679),
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
          realTimeBalance: BigNumber.from(481),
          shares: BigNumber.from(405),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(430)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(641),
          shares: BigNumber.from(600),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(600))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(641956100),
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

    console.log('\x1b[36m%s\x1b[0m', '31--- user1 reddem flow 15');

    await waitForTx(superTokenPoolUser1.redeemFlow(15,0));

    loanStream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user1,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .add(BigNumber.from(5170));

    let periodExpected31: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(2201203299),
      inFlowRate: BigNumber.from(22),
      outFlowRate: BigNumber.from(15),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(98793364),
      yieldTokenIndex: BigNumber.from(5294269),
      yieldOutFlowRateIndex: BigNumber.from(25076933),
      depositFromInFlowRate: BigNumber.from(690000000),

      depositFromOutFlowRate: BigNumber.from(1998939844),
      totalShares: BigNumber.from(2225),
      outFlowAssetsRate: BigNumber.from(63),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1998),
          shares: BigNumber.from(470),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(450)),
          deposit: BigNumber.from(1998939844),

          outAssets: BigNumber.from(63),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(300),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1846),
          shares: BigNumber.from(600),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(940))
            .add(BigNumber.from(90))
            .sub(+fromUser2Stream.deposit)
            .add(BigNumber.from(251))
            .add(BigNumber.from(832)),
          deposit: BigNumber.from(1533467679),
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
          realTimeBalance: BigNumber.from(539),
          shares: BigNumber.from(455),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(480)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(785),
          shares: BigNumber.from(700),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(700))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(641956100),
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

    await waitForTx(superTokenPoolUser2.redeemFlow(9,0));

    let loanStreamuser2 = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user2.address,
      providerOrSigner: user2,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(4960));

    let periodExpected32: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(667735620),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(100345659),
      yieldTokenIndex: BigNumber.from(5336957),
      yieldOutFlowRateIndex: BigNumber.from(26217952),
      depositFromInFlowRate: BigNumber.from(700000000),
      depositFromOutFlowRate: BigNumber.from(3361578602),
      totalShares: BigNumber.from(2295),
      outFlowAssetsRate: BigNumber.from(89),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1440),
          shares: BigNumber.from(320),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(630)).sub(BigNumber.from(450)),
          deposit: BigNumber.from(1368939844),

          outAssets: BigNumber.from(63),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(300),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1992),
          shares: BigNumber.from(670),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(1010)).add(BigNumber.from(90)).add(BigNumber.from(251)).add(BigNumber.from(832)),
          deposit: BigNumber.from(1992638758),

          outAssets: BigNumber.from(26),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(310),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(598),
          shares: BigNumber.from(505),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(530)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(927),
          shares: BigNumber.from(800),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(800))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(641956100),
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

    let erc777User1 = await ERC777__factory.connect(SUPERTOKEN1, user1);

    await waitForTx(erc777User1.send(superPoolTokenAddress, 450, '0x'));

    loanStream = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user1.address,
      providerOrSigner: user1,
    });

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(4870));

    let periodExpected33: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(667735620),

      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(102716062),

      yieldTokenIndex: BigNumber.from(5382835),
      yieldOutFlowRateIndex: BigNumber.from(27721424),
      depositFromInFlowRate: BigNumber.from(850000000),

      depositFromOutFlowRate: BigNumber.from(3088181535),
      totalShares: BigNumber.from(2655),
      outFlowAssetsRate: BigNumber.from(58),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1355),
          shares: BigNumber.from(620),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(630)).add(BigNumber.from(630)).sub(BigNumber.from(900)),
          deposit: BigNumber.from(1355542777),

          outAssets: BigNumber.from(32),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(320),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1771),
          shares: BigNumber.from(580),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(1010)).add(BigNumber.from(90)).add(BigNumber.from(251)).add(BigNumber.from(260)).add(BigNumber.from(832)),
          deposit: BigNumber.from(1732638758),
          outAssets: BigNumber.from(26),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(310),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(661),
          shares: BigNumber.from(555),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(580)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(1081),
          shares: BigNumber.from(900),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(900))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(641956100),
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

    await setNextBlockTimestamp(hre, t0 + 330);

    // #region ================= 34th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#34--- mock yield 50');

    await waitForTx(superTokenPool.mockYield(50));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(4640));

    let periodExpected34: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(667735620),

      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(105524890),

      yieldTokenIndex: BigNumber.from(5428383),

      yieldOutFlowRateIndex: BigNumber.from(29918892),

      depositFromInFlowRate: BigNumber.from(1000000000),
      depositFromOutFlowRate: BigNumber.from(2508181535),

      totalShares: BigNumber.from(2565),
      outFlowAssetsRate: BigNumber.from(58),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1105),
          shares: BigNumber.from(470),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(630)).add(BigNumber.from(950)).sub(BigNumber.from(900)),
          deposit: BigNumber.from(1035542777),
          outAssets: BigNumber.from(32),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(320),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1568),
          shares: BigNumber.from(490),
          tokenBalance: utils.parseEther('10').sub(BigNumber.from(1010)).add(BigNumber.from(90)).add(BigNumber.from(251)).add(BigNumber.from(520)).add(BigNumber.from(832)),
          deposit: BigNumber.from(1472638758),

          outAssets: BigNumber.from(26),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(310),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(726),
          shares: BigNumber.from(605),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(630)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(1238),
          shares: BigNumber.from(1000),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1000))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(641956100),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(290),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 330, periodExpected34, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#34--- Period Tests passed ');
    console.log('');

    // #endregion 34th PERIOD
    await setNextBlockTimestamp(hre, t0 + 340);

    // #region ================= 35th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#35--- user 2 redeem deposit 100');

    await waitForTx(superTokenPoolUser2.redeemDeposit(100));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(4352));

    let periodExpected35: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(667735620),

      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(114571616),
      yieldTokenIndex: BigNumber.from(5554616),

      yieldOutFlowRateIndex: BigNumber.from(34746626),

      depositFromInFlowRate: BigNumber.from(1150000000),

      depositFromOutFlowRate: BigNumber.from(1791927059),

      totalShares: BigNumber.from(2375),
      outFlowAssetsRate: BigNumber.from(64),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(940),
          shares: BigNumber.from(320),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(950)).add(BigNumber.from(950)).sub(BigNumber.from(900)),
          deposit: BigNumber.from(715542777),
          outAssets: BigNumber.from(32),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(320),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1076),
          shares: BigNumber.from(300),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(520))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832)),
          deposit: BigNumber.from(1076384282),

          outAssets: BigNumber.from(32),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(340),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(825),
          shares: BigNumber.from(655),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(680)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(1509),
          shares: BigNumber.from(1100),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1100))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(641956100),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(290),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 340, periodExpected35, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#35--- Period Tests passed ');
    console.log('');

    // #endregion 35th PERIOD
    await setNextBlockTimestamp(hre, t0 + 350);

    // #region ================= 36th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#36--- user4 1050 transfer to user 1');

    let superTokenPoolUser4 = superTokenPool.connect(user4);

    await waitForTx(superTokenPoolUser4.transfer(user1.address, 1050));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(4362));

    let periodExpected36: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      deposit: BigNumber.from(254459354),

      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(126707552),
      yieldTokenIndex: BigNumber.from(5703219),

      yieldOutFlowRateIndex: BigNumber.from(38164332),

      depositFromInFlowRate: BigNumber.from(700000000),

      depositFromOutFlowRate: BigNumber.from(3084100115),

      totalShares: BigNumber.from(2285),
      outFlowAssetsRate: BigNumber.from(60),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(2327),
          shares: BigNumber.from(1220),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(950)).add(BigNumber.from(320)).add(BigNumber.from(950)).sub(BigNumber.from(900)),
          deposit: BigNumber.from(2327715833),

          outAssets: BigNumber.from(28),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(350),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(865),
          shares: BigNumber.from(210),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832)),
          deposit: BigNumber.from(756384282),

          outAssets: BigNumber.from(32),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(340),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(939),
          shares: BigNumber.from(705),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(730)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(228),
          shares: BigNumber.from(150),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1200))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(228679834),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(350),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 350, periodExpected36, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#36--- Period Tests passed ');
    console.log('');

    // #endregion 36th PERIOD

    await setNextBlockTimestamp(hre, t0 + 360);

    // #region ================= 37th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#37--- user4 deposit 2000');

    erc777 = await ERC777__factory.connect(SUPERTOKEN1, user4);

    await waitForTx(erc777.send(superPoolTokenAddress, 2000, '0x'));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(6412));

    let periodExpected37: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(4195),
      deposit: BigNumber.from(2452182525),

      depositFromInFlowRate: BigNumber.from(750000000),
      depositFromOutFlowRate: BigNumber.from(2484100115),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(133481625),
      yieldTokenIndex: BigNumber.from(5834330),
      yieldOutFlowRateIndex: BigNumber.from(44248106),
      outFlowAssetsRate: BigNumber.from(60),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(2218),
          shares: BigNumber.from(1070),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(950)).add(BigNumber.from(600)).add(BigNumber.from(950)).sub(BigNumber.from(900)),
          deposit: BigNumber.from(2047715833),

          outAssets: BigNumber.from(28),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(350),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(740),
          shares: BigNumber.from(120),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(320)),
          deposit: BigNumber.from(436384282),
          outAssets: BigNumber.from(32),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(340),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(1027),
          shares: BigNumber.from(755),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(780)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(2426),
          shares: BigNumber.from(2250),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(3300))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 360, periodExpected37, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#37--- Period Tests passed ');
    console.log('');

    // #endregion 37th PERIOD

    await setNextBlockTimestamp(hre, t0 + 370);

    // #region ================= 38th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#38--- user2 deposit 750');

    erc777 = await ERC777__factory.connect(SUPERTOKEN1, user2);

    await waitForTx(erc777.send(superPoolTokenAddress, 750, '0x'));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(7212));

    let periodExpected38: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(4855),
      deposit: BigNumber.from(2452182525),
      depositFromInFlowRate: BigNumber.from(900000000),
      depositFromOutFlowRate: BigNumber.from(3044793971),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(138517072),
      yieldTokenIndex: BigNumber.from(5925883),
      yieldOutFlowRateIndex: BigNumber.from(47580809),
      outFlowAssetsRate: BigNumber.from(42),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(2031),
          shares: BigNumber.from(920),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(950)).add(BigNumber.from(880)).add(BigNumber.from(950)).sub(BigNumber.from(900)),
          deposit: BigNumber.from(1767715833),

          outAssets: BigNumber.from(28),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(350),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1277),
          shares: BigNumber.from(780),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(640)),
          deposit: BigNumber.from(1277078138),
          outAssets: BigNumber.from(14),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(370),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(1104),
          shares: BigNumber.from(805),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(830)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(2798),
          shares: BigNumber.from(2350),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(3400))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 370, periodExpected38, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#38--- Period Tests passed ');
    console.log('');

    // #endregion 38th PERIOD

    await setNextBlockTimestamp(hre, t0 + 380);

    // #region ================= 39th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#39--- user2 deposit 750');

    await waitForTx(superTokenPool.mockYield(20));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(7442));

    let periodExpected39: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(4765),
      deposit: BigNumber.from(2452182525),
      depositFromInFlowRate: BigNumber.from(1050000000),
      depositFromOutFlowRate: BigNumber.from(2624793971),
      inFlowRate: BigNumber.from(15),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(143707126),
      yieldTokenIndex: BigNumber.from(6005729),

      yieldOutFlowRateIndex: BigNumber.from(52970089),
      outFlowAssetsRate: BigNumber.from(42),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1902),
          shares: BigNumber.from(770),
          tokenBalance: utils.parseEther('10').add(BigNumber.from(950)).add(BigNumber.from(880)).add(BigNumber.from(950)).add(BigNumber.from(280)).sub(BigNumber.from(900)),
          deposit: BigNumber.from(1487715833),

          outAssets: BigNumber.from(28),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(350),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1212),
          shares: BigNumber.from(690),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(640)),
          deposit: BigNumber.from(1137078138),
          outAssets: BigNumber.from(14),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(370),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(1182),
          shares: BigNumber.from(855),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(880)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(3144),
          shares: BigNumber.from(2450),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(3500))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 380, periodExpected39, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#39--- Period Tests passed ');
    console.log('');

    // #endregion 39th PERIOD

    await setNextBlockTimestamp(hre, t0 + 390);

    // #region ================= 40th PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#40--- user2 deposit 750');

    superTokenPoolUser1 = superTokenPool.connect(user1);

    await waitForTx(superTokenPoolUser1.transfer(user2.address, 143));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(7372));

    let periodExpected40: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(4675),
      deposit: BigNumber.from(2452182525),
      depositFromInFlowRate: BigNumber.from(1200000000),
      depositFromOutFlowRate: BigNumber.from(2775405985),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(146210473),
      yieldTokenIndex: BigNumber.from(6039106),
      yieldOutFlowRateIndex: BigNumber.from(54889158),
      outFlowAssetsRate: BigNumber.from(57),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(1290),
          shares: BigNumber.from(477),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(950))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .sub(BigNumber.from(900)),
          deposit: BigNumber.from(1290010961),
          outAssets: BigNumber.from(40),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(390),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1485),
          shares: BigNumber.from(743),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(140))
            .add(BigNumber.from(640)),
          deposit: BigNumber.from(1485395024),

          outAssets: BigNumber.from(17),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(390),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(1246),
          shares: BigNumber.from(905),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(930)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(3350),
          shares: BigNumber.from(2550),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(3600))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 390, periodExpected40, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#40--- Period Tests passed ');
    console.log('');

    // #endregion 40th PERIOD

    await setNextBlockTimestamp(hre, t0 + 400);

    // #region ================= 41st PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#41--- yield 50');

    await waitForTx(superTokenPool.mockYield(50));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(7152));

    let periodExpected41: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(4585),
      deposit: BigNumber.from(2452182525),
      depositFromInFlowRate: BigNumber.from(1350000000),
      depositFromOutFlowRate: BigNumber.from(2205405985),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(148944652),
      yieldOutFlowRateIndex: BigNumber.from(56294568),
      yieldTokenIndex: BigNumber.from(6071272),
      outFlowAssetsRate: BigNumber.from(57),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(946),
          shares: BigNumber.from(327),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(950))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(400))
            .sub(BigNumber.from(900)),
          deposit: BigNumber.from(890010961),
          outAssets: BigNumber.from(40),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(390),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(1339),
          shares: BigNumber.from(653),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(140))
            .add(BigNumber.from(170))
            .add(BigNumber.from(640)),
          deposit: BigNumber.from(1315395024),
          outAssets: BigNumber.from(17),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(390),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(1310),
          shares: BigNumber.from(955),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(980)),
          deposit: BigNumber.from(25779520),
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
          realTimeBalance: BigNumber.from(3555),
          shares: BigNumber.from(2650),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(3700))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 400, periodExpected41, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#41--- Period Tests passed ');
    console.log('');

    // #endregion 41st PERIOD

    await setNextBlockTimestamp(hre, t0 + 410);

    // #region ================= 42nd PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#42--- transfer user 2-> user 3 197');

    superTokenPoolUser2 = superTokenPool.connect(user2);

    await waitForTx(superTokenPoolUser2.transfer(user3.address, 197));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(7232));

    let periodExpected42: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(4495),
      deposit: BigNumber.from(4256095251),
      depositFromInFlowRate: BigNumber.from(500000000),
      depositFromOutFlowRate: BigNumber.from(1282693716),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(157137713),
      yieldOutFlowRateIndex: BigNumber.from(59200201),
      yieldTokenIndex: BigNumber.from(6157514),
      outFlowAssetsRate: BigNumber.from(59),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(662),
          shares: BigNumber.from(177),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(950))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(800))
            .sub(BigNumber.from(900)),
          deposit: BigNumber.from(490010961),
          outAssets: BigNumber.from(40),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(390),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(792),
          shares: BigNumber.from(366),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(140))
            .add(BigNumber.from(170))
            .add(BigNumber.from(810)),
          deposit: BigNumber.from(792682755),

          outAssets: BigNumber.from(19),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(410),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(1829),
          shares: BigNumber.from(1202),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(1030)),
          deposit: BigNumber.from(1829692246),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(410),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(3947),
          shares: BigNumber.from(2750),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(3800))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 410, periodExpected42, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#42--- Period Tests passed ');
    console.log('');

    // #endregion 42st PERIOD

    await setNextBlockTimestamp(hre, t0 + 420);

    // #region ================= 43rd PERIOD ============================= //

    console.log('\x1b[36m%s\x1b[0m', '#43--- user 1 depost 6400');

    erc777 = await ERC777__factory.connect(SUPERTOKEN1, user1);

    await waitForTx(erc777.send(superPoolTokenAddress, 6400, '0x'));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(13692));

    let periodExpected43: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(10805),
      deposit: BigNumber.from(4256095251),
      depositFromInFlowRate: BigNumber.from(650000000),
      depositFromOutFlowRate: BigNumber.from(7322675116),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(160431640),
      yieldOutFlowRateIndex: BigNumber.from(60638693),
      yieldTokenIndex: BigNumber.from(6243442),
      outFlowAssetsRate: BigNumber.from(34),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(6719),
          shares: BigNumber.from(6427),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(950))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(1200))
            .sub(BigNumber.from(900))
            .sub(BigNumber.from(6400)),
          deposit: BigNumber.from(6719992361),
          outAssets: BigNumber.from(15),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(420),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(630),
          shares: BigNumber.from(276),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(140))
            .add(BigNumber.from(170))
            .add(BigNumber.from(1000)),
          deposit: BigNumber.from(602682755),

          outAssets: BigNumber.from(19),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(410),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(2053),
          shares: BigNumber.from(1252),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(1080)),
          deposit: BigNumber.from(1829692246),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(410),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(4288),
          shares: BigNumber.from(2850),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(3900))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 420, periodExpected43, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#43--- Period Tests passed ');
    console.log('');

    // #endregion 43rd PERIOD

    await setNextBlockTimestamp(hre, t0 + 430);

    // #region ================= 44 PERIOD =th============================ //

    console.log('\x1b[36m%s\x1b[0m', '#44--- user 1 -> transfer 2148 to uer-2');

    superTokenPoolUser1 = superTokenPool.connect(user1);

    await waitForTx(superTokenPoolUser1.transfer(user2.address, 2148));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(14002));

    let periodExpected44: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(10715),
      deposit: BigNumber.from(4256095251),
      depositFromInFlowRate: BigNumber.from(800000000),
      depositFromOutFlowRate: BigNumber.from(7304748928),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(50),
      yieldInFlowRateIndex: BigNumber.from(162423326),
      yieldOutFlowRateIndex: BigNumber.from(69307589),
      yieldTokenIndex: BigNumber.from(6284649),
      outFlowAssetsRate: BigNumber.from(27),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(4408),
          shares: BigNumber.from(4129),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(1100))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(1200))
            .sub(BigNumber.from(900))
            .sub(BigNumber.from(6400)),
          deposit: BigNumber.from(4408025801),
          outAssets: BigNumber.from(16),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2896),
          shares: BigNumber.from(2334),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(140))
            .add(BigNumber.from(170))
            .add(BigNumber.from(1190)),
          deposit: BigNumber.from(2896723127),
          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(2188),
          shares: BigNumber.from(1302),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(1130)),
          deposit: BigNumber.from(1829692246),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(410),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(4508),
          shares: BigNumber.from(2950),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(4000))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 430, periodExpected44, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#44--- Period Tests passed ');
    console.log('');

    // #endregion 44th PERIOD
    await setNextBlockTimestamp(hre, t0 + 440);

    // #region ================= 45th PERIOD ============================ //

    console.log('\x1b[36m%s\x1b[0m', '#45--- mock yield 20');

 
    await waitForTx(superTokenPool.mockYield(20));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(14382));

    let periodExpected45: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(10625),
      deposit: BigNumber.from(4256095251),
      depositFromInFlowRate: BigNumber.from(950000000),
      depositFromOutFlowRate: BigNumber.from(7034748928),
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(164794436),
      yieldOutFlowRateIndex: BigNumber.from(80101411),
      yieldTokenIndex: BigNumber.from(6325296),
      outFlowAssetsRate: BigNumber.from(27),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(4420),
          shares: BigNumber.from(3979),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(1100))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(1360))
            .sub(BigNumber.from(900))
            .sub(BigNumber.from(6400)),
          deposit: BigNumber.from(4248025801),
          outAssets: BigNumber.from(16),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2905),
          shares: BigNumber.from(2244),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(140))
            .add(BigNumber.from(170))
            .add(BigNumber.from(1300)),
          deposit: BigNumber.from(2786723127),
          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(2324),
          shares: BigNumber.from(1352),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(1180)),
          deposit: BigNumber.from(1829692246),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(410),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(4730),
          shares: BigNumber.from(3050),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(4100))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 440, periodExpected45, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#45--- Period Tests passed ');
    console.log('');

    // #endregion 45th PERIOD
    await setNextBlockTimestamp(hre, t0 + 450);

    // #region ================= 46th PERIOD ============================ //

    console.log('\x1b[36m%s\x1b[0m', '#46--- user2 redeem deposit 359');

 
    await waitForTx(superTokenPoolUser2.redeemDeposit(359));

    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .add(BigNumber.from(13989));

    let periodExpected46: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(10176),
      deposit: BigNumber.from(4256095251),
      depositFromInFlowRate: BigNumber.from(1100000000),
      depositFromOutFlowRate: BigNumber.from(6456635551),      
      outFlowRate: BigNumber.from(24),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(165916416),
      yieldOutFlowRateIndex: BigNumber.from(84297282),
      yieldTokenIndex: BigNumber.from(6341715),
      outFlowAssetsRate: BigNumber.from(27),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(4327),
          shares: BigNumber.from(3829),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(1260))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(1360))
            .sub(BigNumber.from(900))
            .sub(BigNumber.from(6400)),
          deposit: BigNumber.from(4088025801),
          outAssets: BigNumber.from(16),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2368),
          shares: BigNumber.from(1795),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(140))
            .add(BigNumber.from(140))
            .add(BigNumber.from(170))
            .add(BigNumber.from(473))
            .add(BigNumber.from(1410)),
          deposit: BigNumber.from(2368609750),
          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(450),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(2410),
          shares: BigNumber.from(1402),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(+fromUser3Stream.deposit)
            .sub(BigNumber.from(1230)),
          deposit: BigNumber.from(1829692246),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(5),
          timestamp: BigNumber.from(410),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(4881),
          shares: BigNumber.from(3150),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(4200))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 450, periodExpected46, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#46--- Period Tests passed ');
    console.log('');

    // #endregion 46th PERIOD
  
    await setNextBlockTimestamp(hre, t0 + 460);

    // #region ================= 47th PERIOD ============================ //

    console.log('\x1b[36m%s\x1b[0m', '#47--- user3 redeem flow 33');

 
    await waitForTx(superTokenPoolUser3.redeemFlow(33,0));

    let loanStreamuser3 = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user3.address,
      providerOrSigner: user3,
    });


    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .sub(BigNumber.from(+loanStreamuser3.deposit))
      .add(BigNumber.from(14069));

    let periodExpected47: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(10086),
      deposit: BigNumber.from(2426403005),
      depositFromInFlowRate: BigNumber.from(1000000000),
      depositFromOutFlowRate: BigNumber.from(8685053441), 
      outFlowRate: BigNumber.from(57),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(167249439),
      yieldOutFlowRateIndex: BigNumber.from(88281626),
      yieldTokenIndex: BigNumber.from(6358732),
      outFlowAssetsRate: BigNumber.from(83),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(4231),
          shares: BigNumber.from(3679),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(1420))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(1360))
            .sub(BigNumber.from(900))
            .sub(BigNumber.from(6400)),
          deposit: BigNumber.from(3928025801),
          outAssets: BigNumber.from(16),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2302),
          shares: BigNumber.from(1705),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(250))
            .add(BigNumber.from(140))
            .add(BigNumber.from(170))
            .add(BigNumber.from(473))
            .add(BigNumber.from(1410)),
          deposit: BigNumber.from(2258609750),
          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(450),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(2498),
          shares: BigNumber.from(1452),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(227))
            .sub(BigNumber.from(1280)),
          deposit: BigNumber.from(2498417890),
          outAssets: BigNumber.from(56),
          outFlow: BigNumber.from(33),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(460),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(5036),
          shares: BigNumber.from(3250),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(4300))
            .sub(+fromUser4Stream.deposit),
          deposit: BigNumber.from(2426403005),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(10),
          timestamp: BigNumber.from(360),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 460, periodExpected47, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#47--- Period Tests passed ');
    console.log('');

    // #endregion 47th PERIOD
  
    await setNextBlockTimestamp(hre, t0 + 470);

    // #region ================= 48th PERIOD ============================ //

    console.log('\x1b[36m%s\x1b[0m', '#48--- user3 redeem flow 17');

 
    await waitForTx(superTokenPoolUser4.redeemFlow(17,0));

    let loanStreamuser4 = await sf.cfaV1.getFlow({
      superToken: SUPERTOKEN1,
      sender: superPoolTokenAddress,
      receiver: user4.address,
      providerOrSigner: user4,
    });


    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .sub(BigNumber.from(+loanStreamuser3.deposit))
      .sub(BigNumber.from(+loanStreamuser4.deposit))
      .add(BigNumber.from(13539));

    let periodExpected48: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(9616),
      deposit: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(13050734842),
      outFlowRate: BigNumber.from(74),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(169037212),
      yieldOutFlowRateIndex: BigNumber.from(89978123),
      yieldTokenIndex: BigNumber.from(6375758),
      outFlowAssetsRate: BigNumber.from(109),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(4098),
          shares: BigNumber.from(3529),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(1420))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(1520))
            .sub(BigNumber.from(900))
            .sub(BigNumber.from(6400)),
          deposit: BigNumber.from(3768025801),
          outAssets: BigNumber.from(16),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2211),
          shares: BigNumber.from(1615),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(250))
            .add(BigNumber.from(140))
            .add(BigNumber.from(280))
            .add(BigNumber.from(473))
            .add(BigNumber.from(1410)),
          deposit: BigNumber.from(2148609750),
          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(450),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(2033),
          shares: BigNumber.from(1122),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(787))
            .sub(BigNumber.from(1280)),
          deposit: BigNumber.from(1938417890),
          outAssets: BigNumber.from(56),
          outFlow: BigNumber.from(33),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(460),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(5195),
          shares: BigNumber.from(3350),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(4400)),
          deposit: BigNumber.from(5195681401),
          outAssets: BigNumber.from(26),
          outFlow: BigNumber.from(17),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(470),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 470, periodExpected48, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#48--- Period Tests passed ');
    console.log('');

    // #endregion 48th PERIOD
    await setNextBlockTimestamp(hre, t0 + 480);

    // #region ================= 49th PERIOD ============================ //

    console.log('\x1b[36m%s\x1b[0m', '#49--- user3 redeem All');

 
    await waitForTx(superTokenPoolUser3.closeAccount());




    expedtedPoolBalance = utils
      .parseEther('50')
      .sub(BigNumber.from(+loanStream.deposit))
      .sub(BigNumber.from(+loanStreamuser2.deposit))
      .sub(BigNumber.from(+loanStreamuser4.deposit))
      .add(BigNumber.from(11073));

    let periodExpected49: IPERIOD_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: BigNumber.from(8084),
      deposit: BigNumber.from(0),
      depositFromInFlowRate: BigNumber.from(0),
      depositFromOutFlowRate: BigNumber.from(10582316952),

      outFlowRate: BigNumber.from(41),
      yieldAccruedSec: BigNumber.from(20),
      yieldInFlowRateIndex: BigNumber.from(169037212),
      yieldOutFlowRateIndex: BigNumber.from(91812985),
      yieldTokenIndex: BigNumber.from(6375758),
      outFlowAssetsRate: BigNumber.from(53),
    };

    usersTest = [
      {
        name: 'User1',
        address: user1.address,
        expected: {
          realTimeBalance: BigNumber.from(3968),
          shares: BigNumber.from(3379),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(950))
            .add(BigNumber.from(880))
            .add(BigNumber.from(1420))
            .add(BigNumber.from(280))
            .add(BigNumber.from(280))
            .add(BigNumber.from(1680))
            .sub(BigNumber.from(900))
            .sub(BigNumber.from(6400)),
          deposit: BigNumber.from(3608025801),
          outAssets: BigNumber.from(16),
          outFlow: BigNumber.from(15),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(430),
        },
      },
      {
        name: 'User2',
        address: user2.address,
        expected: {
          realTimeBalance: BigNumber.from(2121),
          shares: BigNumber.from(1525),
          tokenBalance: utils
            .parseEther('10')
            .sub(BigNumber.from(1010))
            .sub(BigNumber.from(750))
            .add(BigNumber.from(90))
            .add(BigNumber.from(251))
            .add(BigNumber.from(840))
            .add(BigNumber.from(618))
            .add(BigNumber.from(832))
            .add(BigNumber.from(250))
            .add(BigNumber.from(140))
            .add(BigNumber.from(280))
            .add(BigNumber.from(473))
            .add(BigNumber.from(1520)),
          deposit: BigNumber.from(2038609750),
          outAssets: BigNumber.from(11),
          outFlow: BigNumber.from(9),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(450),
        },
      },
      {
        name: 'User3',
        address: user3.address,
        expected: {
          realTimeBalance: BigNumber.from(0),
          shares: BigNumber.from(0),
          tokenBalance: utils
            .parseEther('10')
            .add(BigNumber.from(787))
            .add(BigNumber.from(1576))
            .add(BigNumber.from(560))
            .sub(BigNumber.from(1280)),
          deposit: BigNumber.from(0),
          outAssets: BigNumber.from(0),
          outFlow: BigNumber.from(0),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(480),
        },
      },
      {
        name: 'User4',
        address: user4.address,
        expected: {
          realTimeBalance: BigNumber.from(4983),
          shares: BigNumber.from(3180),
          tokenBalance: utils
          .parseEther('10')
          .add(BigNumber.from(260))
          .sub(BigNumber.from(4400)),
          deposit: BigNumber.from(4935681401),
          outAssets: BigNumber.from(26),
          outFlow: BigNumber.from(17),
          inFlow: BigNumber.from(0),
          timestamp: BigNumber.from(470),
        },
      },
    ];

    await testPeriod(BigNumber.from(t0), 480, periodExpected49, contractsTest, usersTest);

    console.log('\x1b[36m%s\x1b[0m', '#49--- Period Tests passed ');
    console.log('');

    // #endregion 49th PERIOD
  });

});