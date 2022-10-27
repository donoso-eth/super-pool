import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv, waitForTx } from '../helpers/utils';
import { join } from 'path';
import { constants } from 'ethers';

import { PoolInfoStructOutput, SuperPoolFactory } from '../typechain-types/SuperPoolFactory';
import { PoolInternalV1__factory, PoolStrategyV1__factory, PoolV1, PoolV1__factory, SuperPoolFactory__factory } from '../typechain-types';

import { INETWORK_CONFIG } from '../helpers/models';
import config from '../hardhat.config';
import { NetworkObject } from '../test/helpers/models-V1';
const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];


task('update_poolStrategy_contract', 'update_poolInternal_contract.ts').setAction(async ({}, hre) => {
  const  [deployer, user1, user2, user3, user4, user5, user6,]= await initEnv(hre);


  let network = hre.network.name;
  if (network == undefined) {
    network = config.defaultNetwork as string;
  }




  let networkAdresses:NetworkObject = JSON.parse(readFileSync(join(processDir,  network +'_contracts.json'), 'utf-8'));


  let poolStrategy = await PoolStrategyV1__factory.connect(networkAdresses.poolStrategyProxy, deployer)
  

  ///// deploy new Implementation poolv1
  let nonce = await deployer.getTransactionCount();
  const poolStrategyImpl = await new PoolStrategyV1__factory(deployer).deploy({ gasLimit: 10000000, nonce:nonce });

  //await pool.updateCode(poolImpl.address)



  await poolStrategy.updateCode(poolStrategyImpl.address,{ gasLimit: 10000000, nonce:nonce + 1} ) 
 
  





});
