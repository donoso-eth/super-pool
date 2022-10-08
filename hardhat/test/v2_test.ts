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
  SettingsV2,
  SettingsV2__factory,
  STokenFactoryV2,
  STokenFactoryV2__factory,
  SuperPoolHost,
  SuperPoolHost__factory,
} from '../typechain-types';

import { BigNumber, utils } from 'ethers';
import {
  fromBnToNumber,
  getPool,
  getTimestamp,
  increaseBlockTime,

  IPOOL_RESULT,
  IUSER_CHECK,
  IUSER_RESULT,
  matchEvent,
  printPeriod,
  printPeriodTest,
  printUser,
  testPeriod,
} from './helpers/utils-V2';
import { Framework, IWeb3FlowInfo, SFError } from '@superfluid-finance/sdk-core';

import { SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';
import { from } from 'rxjs';
import { ethers } from 'hardhat';
import { ICONTRACTS_TEST } from './helpers/utils-V2';
import { readFileSync } from 'fs-extra';
import { INETWORK_CONFIG } from 'hardhat/helpers/models';
import { join } from 'path';


let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactoryV2;
let sTokenFactory: STokenFactoryV2;
let gelatoResolver: GelatoResolverV2;
let poolStrategy:PoolStrategyV2
let settings: SettingsV2;

let superPool:PoolFactoryV2
let superPoolAddress: string;
let sToken: STokenFactoryV2;
let sTokenAddress:string;

let supertokenContract: ISuperfluidToken;

let tokenContract: ERC777;
let contractsTest: ICONTRACTS_TEST;




// let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
// let network_params.superToken = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
// let network_params.token = '0x15F0Ca26781C3852f8166eD2ebce5D18265cceb7';
// let network_params.ops = '0xB3f5503f93d5Ef84b06993a1975B9D21B962892F';
// let GELATO = '0x25aD59adbe00C2d80c86d01e2E05e1294DA84823';
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
let PRECISSION:BigNumber;

let execData;
let execAddress;
let execSelector;
let resolverAddress;
let resolverData;
let resolverHash;

let taskId;

let ONE_DAY = 24 * 3600;
const processDir = process.cwd()
let networks_config = JSON.parse(
  readFileSync(join(processDir, 'networks.config.json'), 'utf-8')
) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];



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

    superPoolHost = await new SuperPoolHost__factory(deployer).deploy(network_params.host);
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

    settings  = await new SettingsV2__factory(deployer).deploy();
    console.log('Settings ---> deployed')


    eventsLib = await new Events__factory(deployer).deploy();

    supertokenContract = await ISuperfluidToken__factory.connect(network_params.superToken, deployer);
    tokenContract = await ERC777__factory.connect(network_params.superToken, deployer);
    erc20 = await ERC20__factory.connect(network_params.token, deployer);
    let superInputStruct: SuperPoolInputStruct = {
      poolFactoryImpl: poolFactory.address,
      sTokenImpl:sTokenFactory.address,
      superToken: network_params.superToken,
      ops: network_params.ops,
      token: network_params.token,
      gelatoResolver: gelatoResolver.address,
      poolStrategy:poolStrategy.address,
      settings: settings.address
    };
    await superPoolHost.createSuperPool(superInputStruct);
    console.log('SuperPool ---> created')
    superTokenResolver = await superPoolHost.getResolverBySuperToken(network_params.superToken)

    superPoolAddress = superTokenResolver.pool;
    sTokenAddress = superTokenResolver.sToken;


    await gelatoResolver.initialize(network_params.ops,superPoolAddress);
    console.log('Gelato resolver ---> initialized')
    await poolStrategy.initialize(network_params.ops,network_params.superToken,network_params.token,superPoolAddress,5);
    console.log('Pool Strategy ---> initialized')

    await settings.initialize();
    console.log('Settings ---> initialized')


    superPool = PoolFactoryV2__factory.connect(superPoolAddress, deployer);
    let initialPoolEth = hre.ethers.utils.parseEther('10');

    await deployer.sendTransaction({ to: superPoolAddress, value: initialPoolEth });

    tokenContract.approve(superPoolAddress, hre.ethers.constants.MaxUint256);

    ops = IOps__factory.connect(network_params.ops, deployer);



  /// let balance
 let balance_deployer = await tokenContract.balanceOf(deployer.address);
 console.log(utils.formatEther(balance_deployer));

    

    /////// Cleaning and preparing init state /////////
    await tokenContract.transfer(superPoolAddress, utils.parseEther('200'));

    user1Balance = await tokenContract.balanceOf(user1.address);

    user2Balance = await tokenContract.balanceOf(user2.address);

    user3Balance = await tokenContract.balanceOf(user3.address);

    user4Balance = await tokenContract.balanceOf(user4.address);

    if (user1Balance.toString() !== '0') {
      await tokenContract.connect(user1).transfer(deployer.address, user1Balance);
    }
    await tokenContract.transfer(user1.address, utils.parseEther('1000'));


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
      params: [network_params.opsExec],
    });

    executor = await hre.ethers.provider.getSigner(network_params.opsExec);

    contractsTest = {
      poolAddress: superPoolAddress,
      superTokenContract: supertokenContract,
      superPool: superPool,
      sToken: sToken,
      tokenContract,
    };


    PRECISSION = await settings.getPrecission();


  });

  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //
   

    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 20 units at t0 ');

    erc777 = await ERC777__factory.connect(network_params.superToken, user1);


  let amount = utils.parseEther("500")

    await erc777.send(superPoolAddress, amount, '0x')
 
    let timest = await superPool.lastPeriodTimestamp();

    let pool = await superPool.getLastPool()


    let expedtedPoolBalance = utils.parseEther('200').add(amount)

    let poolExpected1: IPOOL_RESULT = {
      poolTotalBalance: expedtedPoolBalance,
      totalShares: amount,
      deposit: amount.mul(PRECISSION),
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

    t0 = +(await superPool.lastPeriodTimestamp());

    await testPeriod(BigNumber.from(t0), 0, poolExpected1, contractsTest, usersTest);


    
    
    // #endregion ============== FIRST PERIOD ============================= //

  });
});
