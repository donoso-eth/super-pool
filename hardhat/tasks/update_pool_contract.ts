import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv, waitForTx } from '../helpers/utils';
import { join } from 'path';
import { constants } from 'ethers';
import { INETWORK_CONFIG } from '../helpers/models';
import { PoolInfoStructOutput, SuperPoolFactory } from '../typechain-types/SuperPoolFactory';
import { PoolV1, PoolV1__factory, SuperPoolFactory__factory } from '../typechain-types';



const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];


task('update_pool_contract', 'update_pool_contract.ts').setAction(async ({}, hre) => {
  const  [deployer, user1, user2, user3, user4, user5, user6,]= await initEnv(hre);

  let  deployContract = 'superPoolFactory';
   let toDeployContract = contract_config[deployContract];
   const poolFactoryMetadata = JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8')) ;

  let poolFactory = SuperPoolFactory__factory.connect(poolFactoryMetadata.address, deployer) as SuperPoolFactory;

  console.log(poolFactory.address)

   deployContract = 'poolStrategyV1';
   toDeployContract = contract_config[deployContract];
  const strategy= JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  console.log(strategy.address)

  console.log(network_params.superToken);


  let poolInfo:PoolInfoStructOutput = await poolFactory.getRecordBySuperTokenAddress(network_params.superToken, strategy.address)

  console.log(poolInfo)



  let pool = await PoolV1__factory.connect(poolInfo.pool, deployer) as PoolV1;
  console.log(await pool.owner())
   console.log(await pool.poolFactory())

  console.log(deployer.address)


  

  ///// deploy new Implementation poolv1
  let nonce = await deployer.getTransactionCount();
  const poolImpl = await new PoolV1__factory(deployer).deploy({ gasLimit: 10000000, nonce:nonce });

  //await pool.updateCode(poolImpl.address)



  
  await poolFactory.changePoolImplementation(poolImpl.address,network_params.superToken,strategy.address);


  
console.log((await pool.getVersion()).toString())





});
