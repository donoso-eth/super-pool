// We require the Hardhat Runtime Environment explicitly here. This is opnal
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import { writeFileSync,readFileSync } from "fs";
import {copySync, ensureDir,existsSync } from 'fs-extra'
import { ethers,hardhatArguments, network } from "hardhat";
import config from "../hardhat.config";
import { join } from "path";
import { createHardhatAndFundPrivKeysFiles } from "../helpers/localAccounts";
import * as hre from 'hardhat';
import { Events__factory , SuperPoolHost__factory, PoolStrategyV1__factory, GelatoTasksV1__factory, ResolverSettingsV1__factory, PoolInternalV1__factory } from "../typechain-types";
import { SignerWithAddress} from "@nomiclabs/hardhat-ethers/signers";

import { utils } from "ethers";

import { initEnv } from "../helpers/utils";
import { SuperPoolInputStruct, SupertokenResolverStruct, SupertokenResolverStructOutput } from "../typechain-types/SuperPoolHost";
import { SuperToken } from "@superfluid-finance/sdk-core";
import { INETWORK_CONFIG } from "../helpers/models";
import { ResolverSettingsInitilizerStruct } from "../typechain-types/ResolverSettingsV1";
import { PoolV1__factory } from "../typechain-types/factories/PoolV1__factory";
import { STokenV1__factory } from "../typechain-types/factories/STokenV1__factory";






interface ICONTRACT_DEPLOY {
  artifactsPath:string,
  name:string,
  ctor?:any,
  jsonName:string
}
let deployer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd()
const contract_path = join(processDir,contract_path_relative)

const contract_config = JSON.parse(readFileSync( join(processDir,'contract.config.json'),'utf-8')) as {[key:string]: ICONTRACT_DEPLOY}
  


let networks_config = JSON.parse(
  readFileSync(join(processDir, 'networks.config.json'), 'utf-8')
) as INETWORK_CONFIG;

let network_params = networks_config['goerli'];

const eventAbi:any[] = Events__factory.abi;

ensureDir(contract_path)

async function main() {

let network = hardhatArguments.network;
if (network == undefined) {
  network = config.defaultNetwork as string; 
}

[deployer,user1] = await initEnv(hre);
 network_params = networks_config[network];

if (network == "localhost") {
  network_params = networks_config["goerli"];
}

if (network_params == undefined) {
  throw new Error("NETWORK UNDEFINED");
  
}

  console.log(deployer.address)

  let nonce = await deployer.getTransactionCount();
  console.log(nonce);
  //
  //// DEPLOY POOLFACTORY
  const poolFactoryImpl = await new PoolV1__factory(deployer).deploy({gasLimit:10000000, nonce})

  let toDeployContract = contract_config['poolV1'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  PoolV1__factory.abi.concat(eventAbi),
      name: toDeployContract.name,
      address: poolFactoryImpl.address,
      network: network,
    })
  );

  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(PoolV1__factory.abi.concat(eventAbi))
  );

  console.log(toDeployContract.name + ' Contract Deployed to:', poolFactoryImpl.address);


  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));



  //// DEPLOY SToken
  const sTokenFactoryImpl = await new  STokenV1__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+1})

   toDeployContract = contract_config['sTokenV1'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  STokenV1__factory.abi,
      name: toDeployContract.name,
      address: sTokenFactoryImpl.address,
      network: network,
    })
  );


  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(STokenV1__factory.abi)
  );
  console.log(toDeployContract.name + ' Contract Deployed to:', sTokenFactoryImpl.address);
  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));


  //// DEPLOY PoolStrategy
  const poolStrategy = await new  PoolStrategyV1__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+2})

   toDeployContract = contract_config['poolStrategyV1'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  PoolStrategyV1__factory.abi,
      name: toDeployContract.name,
      address: poolStrategy.address,
      network: network,
    })
  );

  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(PoolStrategyV1__factory.abi)
  );
  console.log(toDeployContract.name + ' Contract Deployed to:', poolStrategy.address);
  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));


    //// DEPLOY Gelato Resolver
    const gelatoTasks = await new  GelatoTasksV1__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+3})

    toDeployContract = contract_config['gelatoTasksV1'];
   writeFileSync(
     `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
     JSON.stringify({
       abi:  GelatoTasksV1__factory.abi,
       name: toDeployContract.name,
       address: gelatoTasks.address,
       network: network,
     })
   );
 
   writeFileSync(
     `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
     JSON.stringify( GelatoTasksV1__factory.abi)
   );
   console.log(toDeployContract.name + ' Contract Deployed to:', gelatoTasks.address);
   ///// copy Interfaces and create Metadata address/abi to assets folder
   copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));
 
   
    //// DEPLOY POOL INTERNAL
    const poolInternal = await new  PoolInternalV1__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+4})

    toDeployContract = contract_config['poolInternalV1'];
   writeFileSync(
     `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
     JSON.stringify({
       abi:  PoolInternalV1__factory.abi,
       name: toDeployContract.name,
       address: poolInternal.address,
       network: network,
     })
   );
 
   writeFileSync(
     `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
     JSON.stringify(PoolInternalV1__factory.abi)
   );
   console.log(toDeployContract.name + ' Contract Deployed to:',  poolInternal.address);
   ///// copy Interfaces and create Metadata address/abi to assets folder
   copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));
 
   

 
 //// DEPLOY Settings
 const resolverSettings = await new ResolverSettingsV1__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+5})

 toDeployContract = contract_config['resolverSettingsV1'];
writeFileSync(
  `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
  JSON.stringify({
    abi:  SuperPoolHost__factory.abi.concat(eventAbi),
    name: toDeployContract.name,
    address:resolverSettings.address,
    network: network,
  })
);

writeFileSync(
  `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
  JSON.stringify(ResolverSettingsV1__factory.abi.concat(eventAbi))
);

console.log(toDeployContract.name + ' Contract Deployed to:',resolverSettings.address);


///// copy Interfaces and create Metadata address/abi to assets folder
copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));



  //// DEPLOY SuperPoolHost
  const superPoolHost = await new SuperPoolHost__factory(deployer).deploy(network_params.host,{gasLimit:10000000, nonce:nonce+6})

   toDeployContract = contract_config['superPoolHost'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  SuperPoolHost__factory.abi.concat(eventAbi),
      name: toDeployContract.name,
      address: superPoolHost.address,
      network: network,
    })
  );

  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(SuperPoolHost__factory.abi.concat(eventAbi))
  );

  console.log(toDeployContract.name + ' Contract Deployed to:', superPoolHost.address);


  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));




  let resolverInit:ResolverSettingsInitilizerStruct = {
    _poolStrategy:poolStrategy.address,
    _gelatoTaks:gelatoTasks.address,
    _gelatoOps:network_params.ops,
    _poolInternal:poolInternal.address
  }



  //// create superPool goerli
  let superInputStruct: SuperPoolInputStruct = {
    poolFactoryImpl: poolFactoryImpl.address,
    superToken: network_params.superToken,
    token:network_params.token,
    sTokenImpl:sTokenFactoryImpl.address,
    settings:resolverSettings.address,
    settingsInitializer:resolverInit
    //
  };

  let tx = await superPoolHost.createSuperPool(superInputStruct,{gasLimit:10000000, nonce:nonce+7});
  await tx.wait();

 

  let resolver: SupertokenResolverStructOutput = await superPoolHost.getResolverBySuperToken(network_params.superToken);

  console.log('Superpool Created: ' + resolver.pool);





  //await poolInternal.initialize(resolverSettings.address,{gasLimit:10000000, nonce:nonce+8});

  console.log('Internal initialized');

  let aavePool = "0x368EedF3f56ad10b9bC57eed4Dac65B26Bb667f6";
  let aToken = "0x1Ee669290939f8a8864497Af3BC83728715265FF";

  console.log('Strategy initialized');
  await poolStrategy.initialize(network_params.ops,network_params.superToken,network_params.token,resolver.pool,aavePool,aToken,network_params.aaveToken,poolInternal.address,{gasLimit:10000000, nonce:nonce+8});
  
  console.log('GelatoTasks initialized');
  await gelatoTasks.initialize(network_params.ops,resolver.pool,poolInternal.address, {gasLimit:10000000, nonce:nonce+9});


  let initialPoolEth = hre.ethers.utils.parseEther('0.1');

  await deployer.sendTransaction({ to: resolver.pool, value: initialPoolEth,gasLimit:10000000, nonce:nonce+10 });

 // let superPoolToken= await superPoolHost.poolAdressBySuperToken(SUPERTOKEN1);



  console.log(resolver);


  ///// create the local accounts file
  if (
    !existsSync(`${contract_path}/local_accouts.json`) &&
    (network == 'localhost' || network == 'hardhat')
  ) {
    const accounts_keys = await createHardhatAndFundPrivKeysFiles(
      hre,
      contract_path
    );
    writeFileSync(
      `${contract_path}/local_accouts.json`,
      JSON.stringify(accounts_keys)
    );
  }

 
  ///// copy addressess files
  if (!existsSync(`${contract_path}/interfaces/common.ts`)) {
    copySync(
      './typechain-types/common.ts',
      join(contract_path, 'interfaces', 'common.ts')
    );
  }


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
