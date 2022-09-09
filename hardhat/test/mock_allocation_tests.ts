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
      token: TOKEN1,
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

    // expect(user1Balance).to.equal(utils.parseEther('10'));

    let balance = await erc20.balanceOf(superPoolTokenAddress);
    console.log(utils.formatEther(balance));
    //throw new Error("");

    t0 = +(await superTokenPool.lastPeriodTimestamp());

    console.log(deployer.address);

    await hre.network.provider.request({
      method: 'hardhat_impersonateAccount',
      params: ['0x25aD59adbe00C2d80c86d01e2E05e1294DA84823'],
    });

    executor = await hre.ethers.provider.getSigner('0x25aD59adbe00C2d80c86d01e2E05e1294DA84823');
  });

  it('should be successfull', async function () {
    // #region ================= FIRST PERIOD ============================= //
    console.log('\x1b[36m%s\x1b[0m', '#1--- User1 provides 20 units at t0 ');

    execData = superTokenPool.interface.encodeFunctionData('depositMock');
    execAddress = superTokenPool.address;
    execSelector = await ops.getSelector('depositMock()');
    resolverAddress = superTokenPool.address;
    resolverData = await superTokenPool.interface.encodeFunctionData('checkerDepositMock');

    resolverHash = utils.keccak256(new utils.AbiCoder().encode(['address', 'bytes'], [resolverAddress, resolverData]));

    taskId = await ops.getTaskId(superTokenPool.address, execAddress, execSelector, false, ETH, resolverHash);

    console.log(taskId);

    let savedId = await superTokenPool.DepositTaksId();
    console.log(savedId);

    await ops.connect(executor).exec(hre.ethers.utils.parseEther('0.0001'), ETH, superTokenPool.address, false, true, resolverHash, execAddress, execData);

    let balanceMock = await erc20.balanceOf(allocationMock.address);
    console.log('mock', balanceMock.toString());

    erc777 = await ERC777__factory.connect(SUPERTOKEN1, user1);

    let amount = utils.parseEther('2');
    await waitForTx(erc777.send(superPoolTokenAddress, amount, '0x'));
    t0 = +(await superTokenPool.lastPeriodTimestamp());

    balanceMock = await erc20.balanceOf(allocationMock.address);
    console.log('mock', balanceMock.toString());
    let mockState = await allocationMock.getCurrentState();
    console.log(mockState.toString());

    let balancesuperToken = await superTokenPool.getBalanceSuperToken();
    console.log(balancesuperToken.toString());

    await ops.connect(executor).exec(hre.ethers.utils.parseEther('0.01'), ETH, superTokenPool.address, false, true, resolverHash, execAddress, execData);

    balanceMock = await erc20.balanceOf(allocationMock.address);
    console.log('mock', balanceMock.toString());
    mockState = await allocationMock.getCurrentState();
    console.log(mockState.toString());

    let canExec = (await superTokenPool.checkerDepositMock())[0];
    console.log(canExec);

    balancesuperToken = await superTokenPool.getBalanceSuperToken();
    console.log(balancesuperToken.toString());

    erc777 = await ERC777__factory.connect(SUPERTOKEN1, user2);

    amount = utils.parseEther('0.49');
    await waitForTx(erc777.send(superPoolTokenAddress, amount, '0x'));

    canExec = (await superTokenPool.checkerDepositMock())[0];
    console.log(canExec);

    mockState = await allocationMock.getCurrentState();
    console.log(mockState.toString());
    balancesuperToken = await superTokenPool.getBalanceSuperToken();
    console.log(balancesuperToken.toString());

    amount = utils.parseEther('0.01');
    await waitForTx(erc777.send(superPoolTokenAddress, amount, '0x'));
    mockState = await allocationMock.getCurrentState();
    console.log(mockState.toString());
    canExec = (await superTokenPool.checkerDepositMock())[0];
    console.log(canExec);
    console.log((+(await getTimestamp())).toString());

    balancesuperToken = await superTokenPool.getBalanceSuperToken();
    console.log(balancesuperToken.toString());

    await ops.connect(executor).exec(hre.ethers.utils.parseEther('0.01'), ETH, superTokenPool.address, false, true, resolverHash, execAddress, execData);

    balanceMock = await erc20.balanceOf(allocationMock.address);
    console.log('mock', balanceMock.toString());

    balancesuperToken = await superTokenPool.getBalanceSuperToken();
    console.log(balancesuperToken.toString());
  });
});
