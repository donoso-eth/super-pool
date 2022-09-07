import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { initEnv, mineBlocks, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { expect } from 'chai';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import {
  AllocationMock,
  AllocationMock__factory,
  ERC20,
  ERC20__factory,
  ERC777,
  ERC777__factory,
  Events__factory,
  IOps,
  IOps__factory,
  ISuperfluidToken,
  ISuperfluidToken__factory,
  PoolFactoryV2,
  PoolFactoryV2__factory,
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
import { MockStateStruct } from '../typechain-types/AllocationMock';

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactoryV2;
let superTokenPool: PoolFactoryV2;
let supertokenContract: ISuperfluidToken;
let allocationMock: AllocationMock;
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

let taskId;

let ONE_DAY = 24 * 3600;

describe.only('Allocation Mock use case test', function () {
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

    poolFactory = await new PoolFactoryV2__factory(deployer).deploy();

    eventsLib = await new Events__factory(deployer).deploy();

    supertokenContract = await ISuperfluidToken__factory.connect(SUPERTOKEN1, deployer);
    tokenContract = await ERC777__factory.connect(SUPERTOKEN1, deployer);
    erc20 = await ERC20__factory.connect(TOKEN1, deployer);
    let superInputStruct: SuperPoolInputStruct = {
      poolFactory: poolFactory.address,
      superToken: SUPERTOKEN1,
      ops: GELATO_OPS,
      token: TOKEN1
    };
    await superPoolHost.createSuperPool(superInputStruct);

    superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(SUPERTOKEN1);

    superTokenPool = PoolFactoryV2__factory.connect(superPoolTokenAddress, deployer);
    let initialPoolEth = hre.ethers.utils.parseEther('10');

    await deployer.sendTransaction({ to: superPoolTokenAddress, value: initialPoolEth });

    tokenContract.approve(superPoolTokenAddress, hre.ethers.constants.MaxUint256);

    ops = IOps__factory.connect(GELATO_OPS, deployer);

    allocationMock = await new AllocationMock__factory(deployer).deploy(superPoolTokenAddress, TOKEN1);

    await superTokenPool.setUpMock(allocationMock.address);
    

    //erc20 = await ERC20__factory.connect(TOKEN1, deployer);
    // erc20.approve(allocationMock.address, hre.ethers.constants.MaxUint256);

    /////// Cleaning and preparing init state /////////
    await tokenContract.transfer(superPoolTokenAddress, utils.parseEther('50'));

    user1Balance = await tokenContract.balanceOf(user1.address);
    if (user1Balance.toString() !== '0') {
      await tokenContract.connect(user1).transfer(deployer.address, user1Balance);
    }
    await tokenContract.transfer(user1.address, utils.parseEther('10'));

   // expect(user1Balance).to.equal(utils.parseEther('10'));

    let balance = await erc20.balanceOf(superPoolTokenAddress);
    console.log(utils.formatEther(balance));
    //throw new Error("");

    t0 = +(await allocationMock.deploymentTimestamp());

    console.log(deployer.address);
  });

  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 20 units at t0 ');

   


    let balancesuperToken = await superTokenPool.getBalanceSuperToken();
    console.log(balancesuperToken.toString());

    let balanceToken = await superTokenPool.getBalanceToken()
    console.log(balanceToken.toString())

    let amount = utils.parseEther("5")
    await superTokenPool.downgrade(amount)

   balancesuperToken = await superTokenPool.getBalanceSuperToken();
    console.log(balancesuperToken.toString());

   balanceToken = await superTokenPool.getBalanceToken()
    console.log(balanceToken.toString())

    await superTokenPool.depositMock(amount)
;
    let result = await  allocationMock.getState()

    console.log(result.toString())

    console.log('\x1b[36m%s\x1b[0m', '#1--- Period Tested #######');
    console.log('');

    // #endregion FIST PERIOD

    await setNextBlockTimestamp(hre, t0 + ONE_DAY * 100);

    await  waitForTx(superTokenPool.calculateStatus());

    result = await  allocationMock.getState()

    console.log(result.toString())

    
  });
});
