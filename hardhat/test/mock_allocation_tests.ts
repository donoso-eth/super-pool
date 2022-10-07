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
  GelatoResolverV2,
  GelatoResolverV2__factory,
  IOps,
  IOps__factory,
  ISuperfluidToken,
  ISuperfluidToken__factory,
  PoolFactoryV2,
  PoolFactoryV2__factory,
  PoolStrategyV2,
  PoolStrategyV2__factory,
  STokenFactoryV2,
  STokenFactoryV2__factory,
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
let poolFactory: PoolFactoryV2;
let sTokenFactory: STokenFactoryV2;
let gelatoResolver: GelatoResolverV2;
let poolStrategy:PoolStrategyV2

let superPool:PoolFactoryV2
let superPoolAddress: string;
let sToken: STokenFactoryV2;
let sTokenAddress:string;

let supertokenContract: ISuperfluidToken;

let tokenContract: ERC777;
let contractsTest: any;

let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let SUPERTOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let TOKEN1 = '0x15F0Ca26781C3852f8166eD2ebce5D18265cceb7';
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

let superPoolBalance: number;
let user1Balance: BigNumber;
let user2Balance: BigNumber;
let user3Balance: BigNumber;
let user4Balance: BigNumber;

let superTokenResolver;

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

let taskId;

let ONE_DAY = 24 * 3600;

describe.only('V2 test', function () {
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
    console.log('Host---> deployed')
    poolFactory = await new PoolFactoryV2__factory(deployer).deploy();
    console.log('Pool Factory---> deployed')
    sTokenFactory = await new STokenFactoryV2__factory(deployer).deploy()
    console.log('Token Factory---> deployed')

    // 
    gelatoResolver = await new GelatoResolverV2__factory(deployer).deploy();
    console.log('Gelato Resolver---> deployed')

    poolStrategy = await new PoolStrategyV2__factory(deployer).deploy();
    console.log('Pool Strategy---> deployed')


    eventsLib = await new Events__factory(deployer).deploy();

    supertokenContract = await ISuperfluidToken__factory.connect(SUPERTOKEN1, deployer);
    tokenContract = await ERC777__factory.connect(SUPERTOKEN1, deployer);
    erc20 = await ERC20__factory.connect(TOKEN1, deployer);
    let superInputStruct: SuperPoolInputStruct = {
      poolFactoryImpl: poolFactory.address,
      sTokenImpl:sTokenFactory.address,
      superToken: SUPERTOKEN1,
      ops: GELATO_OPS,
      token: TOKEN1,
      gelatoResolver: gelatoResolver.address,
      poolStrategy:poolStrategy.address
    };
    await superPoolHost.createSuperPool(superInputStruct);
    console.log('SuperPool ---> created')
    superTokenResolver = await superPoolHost.getResolverBySuperToken(SUPERTOKEN1)

    superPoolAddress = superTokenResolver.pool;
    sTokenAddress = superTokenResolver.sToken;


    await gelatoResolver.initialize(GELATO_OPS,superPoolAddress);
    console.log('Gelato resolver ---> initialized')
    await poolStrategy.initialize(GELATO_OPS,SUPERTOKEN1,TOKEN1,superPoolAddress,5);
    console.log('Pool Strategy ---> initialized')


    superPool = PoolFactoryV2__factory.connect(superPoolAddress, deployer);
    let initialPoolEth = hre.ethers.utils.parseEther('10');

    await deployer.sendTransaction({ to: superPoolAddress, value: initialPoolEth });

    tokenContract.approve(superPoolAddress, hre.ethers.constants.MaxUint256);

    ops = IOps__factory.connect(GELATO_OPS, deployer);



    /////// Cleaning and preparing init state /////////
    await tokenContract.transfer(superPoolAddress, utils.parseEther('50'));

    user1Balance = await tokenContract.balanceOf(user1.address);

    user2Balance = await tokenContract.balanceOf(user2.address);

    user3Balance = await tokenContract.balanceOf(user3.address);

    user4Balance = await tokenContract.balanceOf(user4.address);

    if (user1Balance.toString() !== '0') {
      await tokenContract.connect(user1).transfer(deployer.address, user1Balance);
    }
    await tokenContract.transfer(user1.address, utils.parseEther('10'));

    // if (user2Balance.toString() !== '0') {
    //   await tokenContract.connect(user2).transfer(deployer.address, user2Balance);
    // }
    // await tokenContract.transfer(user2.address, utils.parseEther('10'));

    // if (user3Balance.toString() !== '0') {
    //   await tokenContract.connect(user3).transfer(deployer.address, user3Balance);
    // }
    // await tokenContract.transfer(user3.address, utils.parseEther('10'));

    // if (user4Balance.toString() !== '0') {
    //   await tokenContract.connect(user4).transfer(deployer.address, user4Balance);
    // }
    // await tokenContract.transfer(user4.address, utils.parseEther('10'));

    // user1Balance = await tokenContract.balanceOf(user1.address);
    // user2Balance = await tokenContract.balanceOf(user2.address);
    // user3Balance = await tokenContract.balanceOf(user3.address);
    // user4Balance = await tokenContract.balanceOf(user4.address);

    // expect(user1Balance).to.equal(utils.parseEther('10'));
    // expect(user2Balance).to.equal(utils.parseEther('10'));
    // expect(user3Balance).to.equal(utils.parseEther('10'));
    // expect(user4Balance).to.equal(utils.parseEther('10'));

    // expect(user1Balance).to.equal(utils.parseEther('10'));

    let balance = await erc20.balanceOf(superPoolAddress);
    console.log(utils.formatEther(balance));
    //throw new Error("");

    t0 = +(await superPool.lastPeriodTimestamp());

    console.log(deployer.address);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: [GELATO],
    });

    executor = await hre.ethers.provider.getSigner(GELATO);
  });

  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //
   

    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 20 units at t0 ');

    erc777 = await ERC777__factory.connect(SUPERTOKEN1, user1);

    await erc777.send(superPoolAddress, 20, '0x')
 
    let timest = await superPool.lastPeriodTimestamp();

    let pool = await superPool.getLastPeriod()

    console.log(pool);
  
  //  const receipt = await ethers.provider.getTransactionReceipt(tx.hash);
  
  //  console.log(receipt.logs)

    t0 = +(await superPool.lastPeriodTimestamp());



    
    
    // #endregion ============== FIRST PERIOD ============================= //

  });
});
