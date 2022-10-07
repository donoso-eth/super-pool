import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv, waitForTx } from '../helpers/utils';
import { join } from 'path';
import { constants } from 'ethers';


const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

task('misc', 'miscellaneaous').setAction(async ({}, hre) => {
  const  [deployer, user1, user2, user3, user4, user5, user6,]= await initEnv(hre); console.log(user1.address);







});
