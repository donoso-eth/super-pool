import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { initEnv, mineBlocks, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { expect } from 'chai';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { ERC20, ERC20__factory, ERC777, ERC777__factory, Events__factory, PoolFactory, PoolFactory__factory, SuperPoolHost, SuperPoolHost__factory } from '../typechain-types';

import { utils } from 'ethers';
import { getTimestamp, increaseBlockTime, matchEvent, printPeriod, printUser } from './helpers/utils';
import { Framework } from '@superfluid-finance/sdk-core';

import { SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';

let superPoolHost: SuperPoolHost;
let poolFactory: PoolFactory;
let superTokenPool: PoolFactory;
let supertokenContract:ERC20;

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
let superPoolTokenAddress:string;
let superPoolBalance:number 

describe('Use case test', function () {
    beforeEach(async () => {
      [deployer, user1, user2] = await initEnv(hre);
      provider = hre.ethers.provider;
  
      superPoolHost = await new SuperPoolHost__factory(deployer).deploy(HOST);
  
      poolFactory = await new PoolFactory__factory(deployer).deploy();
  
      eventsLib = await new Events__factory(deployer).deploy();
  
      supertokenContract = await ERC20__factory.connect(TOKEN1, deployer);
  
   
      let superInputStruct: SuperPoolInputStruct = {
        poolFactory: poolFactory.address,
        superToken: TOKEN1,
        ops: GELATO_OPS,
      };
      await superPoolHost.createSuperPool(superInputStruct);
  
      superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(TOKEN1);
  
      superTokenPool = PoolFactory__factory.connect(superPoolTokenAddress, deployer);
  
      sf = await Framework.create({
        networkName: 'local',
        provider: provider,
        customSubgraphQueriesEndpoint: 'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-mumbai',
        resolverAddress: '0x8C54C83FbDe3C59e59dd6E324531FB93d4F504d3',
      });

      let user2Balance = await supertokenContract.balanceOf(user2.address)
      console.log(user2Balance.toString())
  
      
   
      await supertokenContract.transfer(superPoolTokenAddress, utils.parseEther('50'))


  
      if (user2Balance.toString()=="0") {
     
  
      await supertokenContract.transfer(user1.address, utils.parseEther('500'))
      await supertokenContract.transfer(user2.address, utils.parseEther('500'))
     
  
      }

       superPoolBalance = +((await supertokenContract.balanceOf(superPoolTokenAddress)).toString());


    })
    it('Should initialize Loan Factory and transfer balalcne', async function () {
        expect(superPoolBalance).to.equal(50*10**18);

    })

    /////// FIRST PERIOD
    it('#1--- User1 provides 20 units at t0 ', async function () {
        t0 = parseInt(await getTimestamp());
        erc777 = await ERC777__factory.connect(TOKEN1, user1);
        await waitForTx(erc777.send(superPoolTokenAddress, 20, '0x'));

        superPoolBalance = +((await erc777.balanceOf(superPoolTokenAddress)).toString());

        console.log(103,superPoolBalance)


    })

});
  