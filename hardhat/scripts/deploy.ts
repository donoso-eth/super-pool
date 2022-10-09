// We require the Hardhat Runtime Environment explicitly here. This is optional
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
import { STokenFactoryV2__factory, Events__factory,   SuperPoolHost__factory, PoolStrategyV2__factory, GelatoResolverV2__factory, PoolFactoryV2__factory, SettingsV2__factory } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { utils } from "ethers";

import { initEnv } from "../helpers/utils";
import { SuperPoolInputStruct, SupertokenResolverStruct, SupertokenResolverStructOutput } from "../typechain-types/SuperPoolHost";
import { SuperToken } from "@superfluid-finance/sdk-core";
import { INETWORK_CONFIG } from "../helpers/models";




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



  let nonce = await deployer.getTransactionCount();
  //
  //// DEPLOY POOLFACTORY
  const poolFactoryImpl = await new PoolFactoryV2__factory(deployer).deploy({gasLimit:10000000, nonce})

  let toDeployContract = contract_config['poolFactoryV2'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  PoolFactoryV2__factory.abi.concat(eventAbi),
      name: toDeployContract.name,
      address: poolFactoryImpl.address,
      network: network,
    })
  );

  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(PoolFactoryV2__factory.abi.concat(eventAbi))
  );

  console.log(toDeployContract.name + ' Contract Deployed to:', poolFactoryImpl.address);


  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));



  //// DEPLOY SToken
  const sTokenFactoryImpl = await new  STokenFactoryV2__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+1})

   toDeployContract = contract_config['sTokenFactoryV2'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  STokenFactoryV2__factory.abi,
      name: toDeployContract.name,
      address: sTokenFactoryImpl.address,
      network: network,
    })
  );


  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(STokenFactoryV2__factory.abi)
  );
  console.log(toDeployContract.name + ' Contract Deployed to:', sTokenFactoryImpl.address);
  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));


  //// DEPLOY PoolStrategy
  const poolStrategy = await new  PoolStrategyV2__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+2})

   toDeployContract = contract_config['poolStrategyV2'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  PoolStrategyV2__factory.abi,
      name: toDeployContract.name,
      address: poolStrategy.address,
      network: network,
    })
  );

  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(PoolStrategyV2__factory.abi)
  );
  console.log(toDeployContract.name + ' Contract Deployed to:', poolStrategy.address);
  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));


    //// DEPLOY Gelato Resolver
    const gelatoResolver = await new  GelatoResolverV2__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+3})

    toDeployContract = contract_config['gelatoResolverV2'];
   writeFileSync(
     `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
     JSON.stringify({
       abi:  GelatoResolverV2__factory.abi,
       name: toDeployContract.name,
       address: gelatoResolver.address,
       network: network,
     })
   );
 
   writeFileSync(
     `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
     JSON.stringify( GelatoResolverV2__factory.abi)
   );
   console.log(toDeployContract.name + ' Contract Deployed to:', gelatoResolver.address);
   ///// copy Interfaces and create Metadata address/abi to assets folder
   copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));
 
   
 
 //// DEPLOY Settings
 const settings = await new SettingsV2__factory(deployer).deploy({gasLimit:10000000, nonce:nonce+4})

 toDeployContract = contract_config['settingsV2'];
writeFileSync(
  `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
  JSON.stringify({
    abi:  SuperPoolHost__factory.abi.concat(eventAbi),
    name: toDeployContract.name,
    address: settings.address,
    network: network,
  })
);

writeFileSync(
  `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
  JSON.stringify(SettingsV2__factory.abi.concat(eventAbi))
);

console.log(toDeployContract.name + ' Contract Deployed to:', settings.address);


///// copy Interfaces and create Metadata address/abi to assets folder
copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));



  //// DEPLOY SuperPoolHost
  const superPoolHost = await new SuperPoolHost__factory(deployer).deploy(network_params.host,{gasLimit:10000000, nonce:nonce+5})

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







  //// create superPool fdaix on mumbai
  let superInputStruct: SuperPoolInputStruct = {
    poolFactoryImpl: poolFactoryImpl.address,
    superToken: network_params.superToken,
    ops: network_params.ops,
    token:network_params.token,
    sTokenImpl:sTokenFactoryImpl.address,
    poolStrategy:poolStrategy.address,
    gelatoResolver:gelatoResolver.address,
    settings:settings.address
    //
  };

  let tx = await superPoolHost.createSuperPool(superInputStruct,{gasLimit:10000000, nonce:nonce+6});
  await tx.wait();

  let resolver: SupertokenResolverStructOutput = await superPoolHost.getResolverBySuperToken(network_params.superToken);


  await poolStrategy.initialize(network_params.ops,network_params.superToken,network_params.token,resolver.pool,5,{gasLimit:10000000, nonce:nonce+7});
  

  await gelatoResolver.initialize(network_params.ops,resolver.pool,{gasLimit:10000000, nonce:nonce+8});



 // let superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(SUPERTOKEN1);



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
