import { readFileSync } from 'fs-extra';
import { task } from 'hardhat/config';
import { getTimestamp, initEnv, setNextBlockTimestamp, waitForTx } from '../helpers/utils';
import { join } from 'path';
import { constants, utils } from 'ethers';
import { IOps__factory, PoolStrategyV1__factory } from '../typechain-types';
import { INETWORK_CONFIG } from '../helpers/models';

let ONE_DAY = 24 * 3600 * 30;

const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd();
const contract_path = join(processDir, contract_path_relative);
const contract_config = JSON.parse(
  readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
) as { [key: string]: any };

task('push_aave', 'push_aave').setAction(async ({}, hre) => {
  const  [deployer, user1, user2, user3, user4, user5, user6,]= await initEnv(hre); 
  console.log(user1.address);
  const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  
  let networks_config = JSON.parse(
    readFileSync(join(processDir, 'networks.config.json'), 'utf-8')
  ) as INETWORK_CONFIG;
  
  let network_params = networks_config['polygon'];

  const toDeployContract = contract_config['poolStrategyV1'];
  if (toDeployContract == undefined) {
    console.error('Your contract is not yet configured');
    console.error(
      'Please add the configuration to /hardhat/contract.config.json'
    );
    return;
  }

  const metadata = JSON.parse(
    readFileSync(
      `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
      'utf-8'
    )
  );


  await hre.network.provider.request({
    method: 'hardhat_impersonateAccount',
    params: [network_params.opsExec],
  });

 let executor = await hre.ethers.provider.getSigner(network_params.opsExec);


  let   ops = IOps__factory.connect(network_params.ops, deployer);

  let poolStrategy = PoolStrategyV1__factory.connect(metadata.address, deployer);

  const resolverData =  poolStrategy.interface.encodeFunctionData("checkerDeposit");
  const resolverArgs = utils.defaultAbiCoder.encode(
    ["address", "bytes"],
    [poolStrategy.address, resolverData]
  );

 let  execSelector =  poolStrategy.interface.getSighash("depositTask");
  let moduleData = {
    modules: [0],
    args: [resolverArgs],
  };

  const FEE = utils.parseEther("0.1")

  const [, execData] = await poolStrategy.checkerDeposit();

  await ops
    .connect(executor)
    .exec(
      poolStrategy.address,
      poolStrategy.address,
      execData,
      moduleData,
      FEE,
      ETH,
      false,
      true
    );
});
