import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv } from '../helpers/utils';
import { join } from 'path';
import { INETWORK_CONFIG } from '../helpers/models';
import { SuperPoolHost, SuperPoolHost__factory } from '../typechain-types';

const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(readFileSync(join(processDir, 'contract.config.json'), 'utf-8')) as { [key: string]: any };

let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];

task('verify-contract', 'verify').setAction(async ({}, hre) => {
  let deployContract = 'superPoolHost';
  let toDeployContract = contract_config[deployContract];
  const superHost = JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  const [deployer] = await initEnv(hre);

 
  

  // await hre.run('verify:verify', {
  //   address: superHost.address,
  //   constructorArguments: [network_params.host],
  // });

  // console.log('veryfied Host');

  // let host: SuperPoolHost = SuperPoolHost__factory.connect(superHost.address, deployer);

  //let result = await host.getResolverBySuperToken(network_params.superToken);

  deployContract = 'poolV2';
  toDeployContract = contract_config[deployContract];
  const poolFactory = JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  await hre.run('verify:verify', {
    address: poolFactory.address,
    constructorArguments: [],
  });

  deployContract = 'sTokenV2';
  toDeployContract = contract_config[deployContract];
  const sTokenFactory = JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  await hre.run('verify:verify', {
    address: sTokenFactory.address,
    constructorArguments: [],
  });

  deployContract = 'gelatoTasksV2';
  toDeployContract = contract_config[deployContract];
  const gelatoTasks= JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  await hre.run('verify:verify', {
    address: gelatoTasks.address,
    constructorArguments: [],
  });

  
  deployContract = 'poolStrategyV2';
  toDeployContract = contract_config[deployContract];
  const poolStrategy= JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  await hre.run('verify:verify', {
    address: poolStrategy.address,
    constructorArguments: [],
  });

  deployContract = 'resolverSettingsV2';
  toDeployContract = contract_config[deployContract];
  const resolverSettings= JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  await hre.run('verify:verify', {
    address:resolverSettings.address,
    constructorArguments: [],
  });


  
  deployContract = 'poolInternalV2';
  toDeployContract = contract_config[deployContract];
  const poolInternal= JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`, 'utf-8'));

  await hre.run('verify:verify', {
    address:poolInternal.address,
    constructorArguments: [],
  });


  // await hre.run('verify:verify', {
  //   address: '0xEFf7D1F2500ECa73Ff9602C9E2B0071eC6ae0341',
  //   constructorArguments: [],
  // });

  // await hre.run('verify:verify', {
  //   address: '0x7567eDB1cb05784abCf657a3Bac408219b31Ee60',
  //   constructorArguments: [],
  // });

});
