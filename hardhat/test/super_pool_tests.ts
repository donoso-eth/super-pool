import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { expect } from 'chai';
import { ethers } from 'hardhat';
import { initEnv, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import * as hre from 'hardhat';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import {
  ERC777__factory,
  Events__factory,
  SuperPool,
  SuperPool__factory,
} from '../typechain-types';

import { utils } from 'ethers';
import { getTimestamp, increaseBlockTime, matchEvent } from './helpers/utils';
import { Framework } from '@superfluid-finance/sdk-core';
import { parseEther } from 'ethers/lib/utils';

import { of } from 'rxjs';

let superPool: SuperPool;

let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let CFA = '0x49e565Ed1bdc17F3d220f72DF0857C26FA83F873';

let TOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let TOKEN2 = '0x42bb40bF79730451B11f6De1CbA222F17b87Afd7';

let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let provider: BaseProvider;
let eventsLib: any;
let sf: Framework;
let MARKET_PLACE_FEE = 25;
describe('Super Pool Global', function () {
  beforeEach(async () => {
    [deployer, user1, user2, user3] = await initEnv(hre);
    provider = hre.ethers.provider;

    superPool = await new SuperPool__factory(deployer).deploy(HOST, TOKEN1);

    eventsLib = await new Events__factory(deployer).deploy();

    // Launch SF FRAMEOWRK
    // SUPERFLUID SDK INITIALIZATION
    sf = await Framework.create({
      networkName: 'local',
      provider: provider,
      customSubgraphQueriesEndpoint:
        'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-mumbai',
      resolverAddress: '0x8C54C83FbDe3C59e59dd6E324531FB93d4F504d3',
    });
  });

  it('Should Start with No Periods created', async function () {
    expect(await superPool.periodId()).to.equal(0);
  });

  it('Should Deposit and emit event', async function () {
    let t0 = parseInt(await getTimestamp());
    console.log(t0);
    let amountLoan = +utils.parseEther('10').toString();

    let collateralShare = (amountLoan / 10).toFixed(0);
    let durationDays = 365;
    let inflowRate = (amountLoan / (durationDays * 24 * 60 * 60)).toFixed(0);

    let erc777 = await ERC777__factory.connect(TOKEN1, deployer);

    await setNextBlockTimestamp(hre, t0 + 10);

    let receipt = await waitForTx(erc777.send(superPool.address, 10, '0x'));

    matchEvent(receipt, 'SupplyDepositStarted', eventsLib, [
      deployer.address,
      10,
    ]);
    let t1 = await getTimestamp();

    let period = await superPool.periodById(0);
    let period1 = await superPool.periodById(1);
    console.log(period);
    console.log(period1);
    console.log(parseInt(t1));
  });

  it.only('Should when start stream', async function () {
    let amountLoan = +utils.parseEther('10').toString();

    let collateralShare = (amountLoan / 10).toFixed(0);
    let durationDays = 365;
    let inflowRate = (amountLoan / (durationDays * 24 * 60 * 60)).toFixed(0);

    const createFlowOperation = sf.cfaV1.createFlow({
      flowRate: '4',
      receiver: superPool.address,
      superToken: TOKEN1,
    });

    let receipt = await waitForTx(createFlowOperation.exec(deployer));

    let erc777 = await ERC777__factory.connect(TOKEN1, deployer);

    matchEvent(receipt, 'SupplyStreamStarted', eventsLib, [
      deployer.address,
      4,
    ]);

    let t0 = parseInt(await getTimestamp());
    console.log(t0);
    let period = await superPool.periodById(0);

    await setNextBlockTimestamp(hre, t0 + 10);

    receipt = await waitForTx(erc777.send(superPool.address, 20, '0x'));
    let t1  = parseInt(await getTimestamp());
    period = await superPool.periodById(0);
    let period1 = await superPool.periodById(1);
    console.log(period);
    console.log(period1);
    console.log(t1);
  });
});
