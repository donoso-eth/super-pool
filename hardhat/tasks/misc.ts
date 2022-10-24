import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv, waitForTx } from '../helpers/utils';
import { join } from 'path';
import { constants } from 'ethers';
import { PoolV1__factory, STokenV1__factory } from '../typechain-types';


const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

task('misc', 'miscellaneaous').setAction(async ({}, hre) => {
  const  [deployer, user1, user2, user3, user4, user5, user6,]= await initEnv(hre); console.log(user1.address);


let oldImpl = '0xA25c35588875078ae6fe300C82b0220Faa5B22cc';
let newImpl = '0x0dA5CAdDAac598d22055F6c94C2d0e3E62C76dec';

let impl = PoolV1__factory.connect(oldImpl, deployer)

// await impl.updateCode(newImpl);

let pool = PoolV1__factory.connect('0x2691602B2f52c6a075782385cf1ABEB604409c87', deployer)

 await pool.updateCode(newImpl);

let version = await pool.getVersion()

  let owner = await pool.owner()

  console.log(owner);

  console.log(deployer.address);

console.log(version.toString())


});
