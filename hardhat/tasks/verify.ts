import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv } from '../helpers/utils';
import { join } from 'path';


let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
//let CFA = '0x49e565Ed1bdc17F3d220f72DF0857C26FA83F873';
let SUPERTOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let TOKEN1 = '0x15F0Ca26781C3852f8166eD2ebce5D18265cceb7';
let GELATO_OPS = '0xB3f5503f93d5Ef84b06993a1975B9D21B962892F';

const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

task('verify-contract', 'verify').setAction(async ({}, hre) => {
  let deployContract = 'superPoolHost';
  let toDeployContract = contract_config[deployContract];
  const superHost = JSON.parse(
    readFileSync(
      `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
      'utf-8'
    )
  );

  const [deployer] = await initEnv(hre);


  console.log(deployer.address);

      console.log(superHost.address)

  await hre.run('verify:verify', {
    address: superHost.address,
    constructorArguments: [HOST],
  });
});
