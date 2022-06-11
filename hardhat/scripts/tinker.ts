import { Contract, providers, Signer, utils } from 'ethers';
import { readFileSync } from 'fs-extra';
import { initEnv, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import {
  ERC20__factory,
  ERC777__factory,
  PoolFactory__factory,
  SuperPoolHost__factory,
} from '../typechain-types';
import { join } from 'path';
import * as hre from 'hardhat';
import { SuperPoolInputStruct } from '../typechain-types/SuperPoolHost';
import { Framework } from '@superfluid-finance/sdk-core';
import { getTimestamp, printPeriod } from '../test/helpers/utils';
import { PeriodStruct } from '../typechain-types/PoolFactory';

let TOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let zeroAddress = '0x0000000000000000000000000000000000000000';
const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

const tinker = async () => {
  const [deployer, user1, user2, user3, user4] = await initEnv(hre);

  console.log(deployer.address);

  // ADDRESS TO MINT TO:
  let deployContract = 'superPoolHost';
  let toDeployContract = contract_config[deployContract];
  let superPoolHostMetadata = JSON.parse(
    readFileSync(
      `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
      'utf-8'
    )
  );

  deployContract = 'poolFactory';
  toDeployContract = contract_config[deployContract];
  let poolFactotyMetadata = JSON.parse(
    readFileSync(
      `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
      'utf-8'
    )
  );

  const superPoolHost = SuperPoolHost__factory.connect(
    superPoolHostMetadata.address,
    deployer
  );

  let superotkenContract = await ERC20__factory.connect(TOKEN1, deployer);
  let poolAddress = await superPoolHost.poolAdressBySuperToken(TOKEN1);

  if (poolAddress == zeroAddress) {
    let PoolInput: SuperPoolInputStruct = {
      poolFactory: poolFactotyMetadata.address,
      superToken: TOKEN1,
    };

    let receipt = await waitForTx(superPoolHost.createSuperPool(PoolInput));
    poolAddress = await superPoolHost.poolAdressBySuperToken(TOKEN1);

    await superotkenContract.transfer(user1.address, utils.parseEther('100'));
    await superotkenContract.transfer(user2.address, utils.parseEther('100'));
    await superotkenContract.transfer(user3.address, utils.parseEther('50'));
    await superotkenContract.transfer(user4.address, utils.parseEther('100'));
  }

  let provider = hre.ethers.provider;
  let sf = await Framework.create({
    networkName: 'local',
    provider: provider,
    customSubgraphQueriesEndpoint:
      'https://api.thegraph.com/subgraphs/name/superfluid-finance/protocol-v1-mumbai',
    resolverAddress: '0x8C54C83FbDe3C59e59dd6E324531FB93d4F504d3',
  });

  ////// recreate period 0, user1 start flow 4

  let erc777 = await ERC777__factory.connect(TOKEN1, user1);
  let user1Balance = (await erc777.balanceOf(user1.address)).toString();

  let poolContract = PoolFactory__factory.connect(poolAddress, deployer);



  let createFlowOperation = sf.cfaV1.createFlow({
    flowRate: '4',
    receiver: poolAddress,
    superToken: TOKEN1,
  });

  let receipt = await waitForTx(createFlowOperation.exec(user1));

  let t0 = parseInt(await getTimestamp());

  console.log('t0: ', 0);

  ////// recreate period 1 + 10 sec user2 deposit 20 ////
  await setNextBlockTimestamp(hre, t0 + 10);
  erc777 = await ERC777__factory.connect(TOKEN1, user2);
  receipt = await waitForTx(erc777.send(poolAddress, 20, '0x'));
  let t1 = parseInt(await getTimestamp());
  await printPeriod(0, poolContract);

  console.log('t1: ', t1 - t0);
};

const sleep = (ms: number) => {
  return new Promise((resolve) => setTimeout(resolve, ms));
};

tinker()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
