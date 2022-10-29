import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv, waitForTx } from '../helpers/utils';
import { join } from 'path';
import { constants } from 'ethers';
import { INETWORK_CONFIG } from '../helpers/models';
import { PoolInfoStructOutput, SuperPoolFactory } from '../typechain-types/SuperPoolFactory';
import { PoolInternalV1__factory, PoolV1, PoolV1__factory, SuperPoolFactory__factory } from '../typechain-types';


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


task('update_poolInternal_contract', 'update_poolInternal_contract.ts').setAction(async ({}, hre) => {
  const  [deployer, user1, user2, user3, user4, user5, user6,]= await initEnv(hre);


  let network = hre.network.name;
  if (network == undefined) {
    network = config.defaultNetwork as string;
  }




  let networkAdresses:NetworkObject = JSON.parse(readFileSync(join(processDir,  network +'_contracts.json'), 'utf-8'));



  let poolInternal = await PoolV1__factory.connect(networkAdresses.poolInternalProxy, deployer) as PoolV1;


  console.log(deployer.address)


  

  ///// deploy new Implementation poolv1
  let nonce = await deployer.getTransactionCount();
  const poolInternalImpl = await new PoolInternalV1__factory(deployer).deploy({ gasLimit: 10000000, nonce:nonce });

  //await pool.updateCode(poolImpl.address)

 await poolInternal.updateCode(poolInternalImpl.address,{ gasLimit: 10000000, nonce:nonce + 1} ) 



  





});
