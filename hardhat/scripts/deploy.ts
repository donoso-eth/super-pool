// We require the Hardhat Runtime Environment explicitly here. This is opnal
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import { writeFileSync, readFileSync } from 'fs';
import { copySync, ensureDir, existsSync } from 'fs-extra';
import { ethers, hardhatArguments, network } from 'hardhat';
import config from '../hardhat.config';
import { join } from 'path';
import { createHardhatAndFundPrivKeysFiles } from '../helpers/localAccounts';
import * as hre from 'hardhat';
import { Events__factory, PoolStrategyV1__factory, PoolInternalV1__factory, SuperPoolFactory__factory, UUPSProxy__factory, UUPSProxy } from '../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { initEnv, waitForTx } from '../helpers/utils';
import { INETWORK_CONFIG } from '../helpers/models';
import { PoolV1__factory } from '../typechain-types/factories/PoolV1__factory';
import { CreatePoolInputStruct, SuperPoolFactory, SuperPoolFactoryInitializerStruct } from '../typechain-types/SuperPoolFactory';

interface ICONTRACT_DEPLOY {
  artifactsPath: string;
  name: string;
  ctor?: any;
  jsonName: string;
}
let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);

const contract_config = JSON.parse(readFileSync(join(processDir, 'contract.config.json'), 'utf-8')) as { [key: string]: ICONTRACT_DEPLOY };

let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];

const eventAbi: any[] = Events__factory.abi;

ensureDir(contract_path);

async function main() {
  let addressObject = {} as {
    poolImpl: string;
    poolInternalImpl: string;
    poolStrategyImpl: string;
    poolFactoryImpl: string;
    poolProxy: string;
    poolInternalProxy: string;
    poolStrategyProxy: string;
    poolFactoryProxy: string;
  };

  let network = hardhatArguments.network;
  if (network == undefined) {
    network = config.defaultNetwork as string;
  }

  [deployer, user1] = await initEnv(hre);
  network_params = networks_config[network];

  if (network == 'localhost') {
    network_params = networks_config['goerli'];
  }

  if (network_params == undefined) {
    throw new Error('NETWORK UNDEFINED');
  }

  console.log(deployer.address);

  let nonce = await deployer.getTransactionCount();
  console.log(nonce);

  //// DEPLOY POOL IMPL
  const poolImpl = await new PoolV1__factory(deployer).deploy({ gasLimit: 10000000, nonce: nonce });

  addressObject.poolImpl = poolImpl.address;

  let toDeployContract = contract_config['poolV1'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi: PoolV1__factory.abi.concat(eventAbi),
      name: toDeployContract.name,
      address: poolImpl.address,
      network: network,
    })
  );

  writeFileSync(`../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`, JSON.stringify(PoolV1__factory.abi.concat(eventAbi)));

  console.log(toDeployContract.name + ' Contract Deployed to:', poolImpl.address);

  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));

  //// DEPLOY PoolStrategy
  let poolStrategyImpl = await new PoolStrategyV1__factory(deployer).deploy({ gasLimit: 10000000, nonce: nonce + 1 });

  let proxyStrategy: any = await new UUPSProxy__factory(deployer).deploy({ gasLimit: 10000000, nonce: nonce + 2 });

  await proxyStrategy.initializeProxy(poolStrategyImpl.address, { gasLimit: 10000000, nonce: nonce + 3 });

  addressObject.poolStrategyImpl = poolStrategyImpl.address;
  addressObject.poolStrategyProxy = proxyStrategy.address;


  toDeployContract = contract_config['poolStrategyV1'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi: PoolStrategyV1__factory.abi,
      name: toDeployContract.name,
      address: proxyStrategy.address,
      network: network,
    })
  );

  writeFileSync(`../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`, JSON.stringify(PoolStrategyV1__factory.abi));
  console.log(toDeployContract.name + ' Contract Deployed to:', addressObject.poolStrategyProxy);
  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));

  //// DEPLOY POOL INTERNAL
  const poolInternalImpl = await new PoolInternalV1__factory(deployer).deploy({ gasLimit: 10000000, nonce: nonce + 4 });

  toDeployContract = contract_config['poolInternalV1'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi: PoolInternalV1__factory.abi,
      name: toDeployContract.name,
      address: poolInternalImpl.address,
      network: network,
    })
  );

  writeFileSync(`../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`, JSON.stringify(PoolInternalV1__factory.abi));
  console.log(toDeployContract.name + ' Contract Deployed to:', poolInternalImpl.address);
  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));

  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));

  addressObject.poolInternalImpl = poolInternalImpl.address;

  let superPoolFactoryImpl: SuperPoolFactory = await new SuperPoolFactory__factory(deployer).deploy({ gasLimit: 10000000, nonce: nonce + 5 });

  //// DEPLOY SuperPoolFactory
  let factoryInit: SuperPoolFactoryInitializerStruct = {
    host: network_params.host,
    poolImpl: poolImpl.address,
    poolInternalImpl: poolInternalImpl.address,
    ops: network_params.ops,
  };

  let proxySuperPoolFactory: any = await new UUPSProxy__factory(deployer).deploy({ gasLimit: 10000000, nonce: nonce + 6 });

  await proxySuperPoolFactory.initializeProxy(superPoolFactoryImpl.address, { gasLimit: 10000000, nonce: nonce + 7 });

  addressObject.poolFactoryImpl = superPoolFactoryImpl.address;
  addressObject.poolFactoryProxy = proxySuperPoolFactory.address;

  let superPoolFactory = SuperPoolFactory__factory.connect(proxySuperPoolFactory.address, deployer);

  await waitForTx(superPoolFactory.initialize(factoryInit, { gasLimit: 10000000, nonce: nonce + 8 }));

  toDeployContract = contract_config['superPoolFactory'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi: SuperPoolFactory__factory.abi.concat(eventAbi),
      name: toDeployContract.name,
      address: proxySuperPoolFactory.address,
      network: network,
    })
  );

  writeFileSync(`../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`, JSON.stringify(SuperPoolFactory__factory.abi.concat(eventAbi)));

  console.log(toDeployContract.name + ' Contract Deployed to:', proxySuperPoolFactory.address);

  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));

  let createPool: CreatePoolInputStruct = {
    superToken: network_params.superToken,
    poolStrategy: addressObject.poolStrategyProxy,
  };

  let tx = await superPoolFactory.createSuperPool(createPool, { gasLimit: 10000000, nonce: nonce +9 });

  await tx.wait();

  // let resolver: SupertokenResolverStructOutput = await superPoolFactory..getResolverBySuperToken(network_params.superToken);
  let poolRecord = await superPoolFactory.getRecordBySuperTokenAddress(network_params.superToken, addressObject.poolStrategyProxy);

  let poolProxyAddress = poolRecord.pool;
  let poolInternalProxyAddress = poolRecord.poolInternal;

  let aavePool = '0x368EedF3f56ad10b9bC57eed4Dac65B26Bb667f6';
  let aToken = '0x1Ee669290939f8a8864497Af3BC83728715265FF';

  await PoolStrategyV1__factory.connect(addressObject.poolStrategyProxy, deployer).initialize(network_params.ops, network_params.superToken, network_params.token, 
    poolProxyAddress, aavePool, aToken, network_params.aaveToken, 
    poolInternalProxyAddress, { gasLimit: 10000000, nonce: nonce + 10 });

  let initialPoolEth = hre.ethers.utils.parseEther('0.1');

  await deployer.sendTransaction({ to: poolProxyAddress, value: initialPoolEth, gasLimit: 10000000, nonce: nonce + 11 });

  // let superPoolToken= await superPoolFactory.poolAdressBySuperToken(SUPERTOKEN1);

  console.log(poolRecord);

  addressObject.poolProxy = poolRecord.pool;
  addressObject.poolInternalProxy = poolRecord.poolInternal;

  ///// create the local accounts file
  if (!existsSync(`${contract_path}/local_accouts.json`) && (network == 'localhost' || network == 'hardhat')) {
    const accounts_keys = await createHardhatAndFundPrivKeysFiles(hre, contract_path);
    writeFileSync(`${contract_path}/local_accouts.json`, JSON.stringify(accounts_keys));
  }

  ///// copy addressess files
  if (!existsSync(`${contract_path}/interfaces/common.ts`)) {
    copySync('./typechain-types/common.ts', join(contract_path, 'interfaces', 'common.ts'));
  }


writeFileSync(join(processDir,  network +'_contracts.json'),JSON.stringify( addressObject))
}
// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
