import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { initEnv, mineBlocks, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { ERC20__factory, ERC777, ERC777__factory, Events__factory, PoolFactory, PoolFactory__factory, SuperPoolHost, SuperPoolHost__factory } from '../typechain-types';

import { utils } from 'ethers';
import { getTimestamp, increaseBlockTime, matchEvent, printPeriod, printUser } from './helpers/utils';
import { Framework } from '@superfluid-finance/sdk-core';
import { parseEther } from 'ethers/lib/utils';

import { of } from 'rxjs';
import { SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactory;
let superTokenPool: PoolFactory;
let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let CFA = '0x49e565Ed1bdc17F3d220f72DF0857C26FA83F873';

let TOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let TOKEN2 = '0x42bb40bF79730451B11f6De1CbA222F17b87Afd7';

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
let superPoolTokenAddress:string;
let MARKET_PLACE_FEE = 25;

let hour = 3600;

describe('Super Pool Global', function () {
  beforeEach(async () => {
    [deployer, user1, user2, user3, user4] = await initEnv(hre);
    provider = hre.ethers.provider;

    superPoolHost = await new SuperPoolHost__factory(deployer).deploy(HOST);

    poolFactory = await new PoolFactory__factory(deployer).deploy();

    eventsLib = await new Events__factory(deployer).deploy();

    let supertokenContract = await ERC20__factory.connect(TOKEN1, deployer);

    let deployerBalance = await supertokenContract.balanceOf(deployer.address)

    console.log(utils.formatEther(deployerBalance));


    

    let user4Balance = await supertokenContract.balanceOf(user2.address)
    console.log(user4Balance.toString())

    
 

    if (user4Balance.toString()=="0") {
   

    await supertokenContract.transfer(user1.address, utils.parseEther('750'))
    await supertokenContract.transfer(user2.address, utils.parseEther('750'))
    // await supertokenContract.transfer(user3.address, utils.parseEther('50'))
    // await supertokenContract.transfer(user4.address, utils.parseEther('100'))

    }



    let superInputStruct: SuperPoolInputStruct = {
      poolFactory: poolFactory.address,
      superToken: TOKEN1,
      ops: GELATO_OPS,
    };
    await superPoolHost.createSuperPool(superInputStruct);

    superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(TOKEN1);

    superTokenPool = PoolFactory__factory.connect(superPoolTokenAddress, deployer);

    // Launch SF FRAMEOWRK
    // SUPERFLUID SDK INITIALIZATION
    sf = await Framework.create({
      networkName: 'local',
      provider: provider,
      customSubgraphQueriesEndpoint: 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-mumbai',
      resolverAddress: '0x8C54C83FbDe3C59e59dd6E324531FB93d4F504d3',
    });

    ////// initialize pool
    erc777 = await ERC777__factory.connect(TOKEN1, user1);
    await waitForTx(erc777.send(superPoolTokenAddress, utils.parseEther("20"), '0x'));

    t0 = parseInt(await getTimestamp());

    await setNextBlockTimestamp(hre, t0 + 10 * hour);

    let inflow = (+utils.parseEther("5").toString() / hour).toFixed(0);
    console.log(inflow)

    const operation = sf.cfaV1.createFlow({
      receiver: superPoolTokenAddress,
      flowRate: inflow,
      superToken: TOKEN1,
    });

    await operation.exec(user2);
    await setNextBlockTimestamp(hre, t0 + 20 *hour);

    await waitForTx(superTokenPool.mockYield(utils.parseEther("10")));
   
  });

  it('Should Start with No Fake values created', async function () {
    //  let period = await printPeriod(superTokenPool,t0);
    //   expect(+(period.flowRate.toString())).to.equal(5);

    await setNextBlockTimestamp(hre, t0 + 30 * hour);

 

    await waitForTx(superTokenPool.mockYield(utils.parseEther("20")));


    await setNextBlockTimestamp(hre, t0 + 40 * hour);

    let inflow2 = (+utils.parseEther("6").toString() / hour).toFixed(0);;
    console.log(inflow2)

    const operation = sf.cfaV1.createFlow({
      receiver: superTokenPool.address,
      flowRate: inflow2,
      superToken: TOKEN1,
    });

    await operation.exec(user1);
    await printPeriod(superTokenPool, t0);
    await printUser(superTokenPool, user1.address)
    await printUser(superTokenPool, user2.address)

    let realTimeBalanceUser2 = await superTokenPool.totalBalanceSupplier(user2.address)
    console.log('user2:   ', realTimeBalanceUser2 .toString())
    await setNextBlockTimestamp(hre, t0 + 50 * hour);
    await waitForTx(erc777.send(superTokenPool.address, utils.parseEther("50"), '0x'));
    await printPeriod(superTokenPool, t0);
    let realTimeBalanceUser1 = await superTokenPool.totalBalanceSupplier(user1.address)
    console.log('user1:   ', realTimeBalanceUser1 .toString())

     realTimeBalanceUser2 = await superTokenPool.totalBalanceSupplier(user2.address)
    console.log('user2:   ',  realTimeBalanceUser2 .toString())
    await setNextBlockTimestamp(hre, t0 + 60 * hour);

    await waitForTx(superTokenPool.mockYield(utils.parseEther("10")));

    await printPeriod(superTokenPool, t0);
    realTimeBalanceUser1 = await superTokenPool.totalBalanceSupplier(user1.address)
    console.log('user1:   ', realTimeBalanceUser1 .toString())

     realTimeBalanceUser2 = await superTokenPool.totalBalanceSupplier(user2.address)
    console.log('user2:   ',  realTimeBalanceUser2 .toString())

    await setNextBlockTimestamp(hre, t0 + 70 * hour);

    let superTokenPoolUser2 =  PoolFactory__factory.connect(superPoolTokenAddress,user2 )
 
    let inflow3 = (+utils.parseEther("9").toString() / hour).toFixed(0);
    console.log(inflow3)
   await  superTokenPoolUser2.withdrawStreamStart(inflow3);

   const loanStream = await sf.cfaV1.getFlow({
    superToken: TOKEN1,
    sender: superPoolTokenAddress,
    receiver: user2.address,
    providerOrSigner: user2,
  });

  console.log(loanStream)

  await printPeriod(superTokenPool, t0);
  await printUser(superTokenPool, user2.address)


  });

  //   it('Should Deposit and emit event', async function () {
  //     let t0 = parseInt(await getTimestamp());
  //     console.log(t0);
  //     let amountLoan = +utils.parseEther('10').toString();

  //     let collateralShare = (amountLoan / 10).toFixed(0);
  //     let durationDays = 365;
  //     let inflowRate = (amountLoan / (durationDays * 24 * 60 * 60)).toFixed(0);

  //     let erc777 = await ERC777__factory.connect(TOKEN1, deployer);

  //     await setNextBlockTimestamp(hre, t0 + 10);

  //     let receipt = await waitForTx(erc777.send(superPool.address, 10, '0x'));

  //     matchEvent(receipt, 'SupplyDepositStarted', eventsLib, [
  //       deployer.address,
  //       10,
  //     ]);
  //     let t1 = await getTimestamp();

  //     let period = await superPool.periodById(0);
  //     let period1 = await superPool.periodById(1);
  //     console.log(period);
  //     console.log(period1);
  //     console.log(parseInt(t1));
  //   });

  //   it.only('Should when start stream', async function () {

  //     ////// recreate period 0, user1 start flow 4

  //     let erc777 = await ERC777__factory.connect(TOKEN1, user1);
  //     let user1Balance = (await erc777.balanceOf(user1.address)).toString()
  //     console.log(user1Balance)

  //    let createFlowOperation = sf.cfaV1.createFlow({
  //       flowRate: '4',
  //       receiver: superPool.address,
  //       superToken: TOKEN1,
  //     });

  //     let receipt = await waitForTx(createFlowOperation.exec(user1));

  //     matchEvent(receipt, 'SupplyStreamStarted', eventsLib, [
  //       user1.address,
  //       4,
  //     ]);

  //     let t0 = parseInt(await getTimestamp());

  //     console.log('t0: ',0);

  //     ////// recreate period 1 + 10 sec user2 deposit 20 ////
  //     await setNextBlockTimestamp(hre, t0 + 10);
  //     erc777 = await ERC777__factory.connect(TOKEN1, user2);
  //     receipt = await waitForTx(erc777.send(superPool.address, 20, '0x'));
  //     let t1  = parseInt(await getTimestamp());
  //     printPeriod(0,superPool)

  //     console.log('t1: ',t1-t0);

  //      ////// recreate period 2 + 5 sec user3 mock rewards 5////
  //     await setNextBlockTimestamp(hre, t1 + 5);
  //     let user3SuperPool = await SuperPool__factory.connect(superPool.address,user3)

  //     receipt = await waitForTx(user3SuperPool.mockReward(5));
  //     let t2  = parseInt(await getTimestamp());

  //     printPeriod(1,superPool);
  //     console.log('t2: ',t2-t0);

  //     ////// recreate period 3 + 25 sec user3 mock rewards 8////
  //     await setNextBlockTimestamp(hre, t2 + 25);
  //     receipt = await waitForTx(user3SuperPool.mockReward(8));

  //     printPeriod(2,superPool)
  //     let t3  = parseInt(await getTimestamp());
  //     console.log('t3: ',t3-t0);

  //     ////// recreate period 4 + 10 sec user28////
  //     await setNextBlockTimestamp(hre, t3 + 10);
  //     createFlowOperation = sf.cfaV1.createFlow({
  //       flowRate: '6',
  //       receiver: superPool.address,
  //       superToken: TOKEN1,
  //     });

  //     receipt = await waitForTx(createFlowOperation.exec(user4));

  //     printPeriod(3,superPool)
  //     let t4  = parseInt(await getTimestamp());
  //     console.log('t4: ',t4-t0);

  //        ////// recreate period 5 + 10 sec user3 mock rewards 15////
  //    await setNextBlockTimestamp(hre, t4 + 10);
  //    receipt = await waitForTx(user3SuperPool.mockReward(15));
  //    printPeriod(4,superPool)
  //    let t5  = parseInt(await getTimestamp());
  //    console.log('t5: ',t5-t0);

  //     await waitForTx(superPool.calculateRewardsSupplier(user2.address))

  //   });
});
