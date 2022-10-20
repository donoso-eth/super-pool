import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { getTimestamp, initEnv, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import { join } from 'path';
import { constants } from 'ethers';
import { STokenV2__factory } from '../typechain-types';

let ONE_DAY = 24 * 3600 * 30;

const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

task('addTime', 'addTIme').setAction(async ({}, hre) => {
  const  [deployer, user1, user2, user3, user4, user5, user6,]= await initEnv(hre); 
  console.log(user1.address);

  let t0 = +(await getTimestamp(hre));
  await setNextBlockTimestamp(hre, t0 + ONE_DAY);
});
