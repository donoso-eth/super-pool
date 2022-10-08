import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { initEnv } from '../helpers/utils';
import { join } from 'path';
import { INETWORK_CONFIG } from '../helpers/models';




const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };



let networks_config = JSON.parse(
  readFileSync(join(processDir, 'networks.config.json'), 'utf-8')
) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];



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
    constructorArguments: [network_params.host],
  });
});
