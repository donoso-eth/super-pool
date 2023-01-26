import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv } from '../helpers/utils';
import { join } from 'path';
import { INETWORK_CONFIG } from '../helpers/models';
import { SuperPoolFactory, SuperPoolFactory__factory } from '../typechain-types';

const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(readFileSync(join(processDir, 'contract.config.json'), 'utf-8')) as { [key: string]: any };

let networks_config = JSON.parse(readFileSync(join(processDir, 'networks.config.json'), 'utf-8')) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];

task('verify-contract', 'verify').setAction(async ({}, hre) => {
 
  await hre.run('verify:verify', {
    address: "0x8bd94924234b9F5215b1b80e68099B55e4EC665F",
    constructorArguments: [],
  });



  


});
