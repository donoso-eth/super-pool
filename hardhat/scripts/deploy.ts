// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.

import { writeFileSync,readFileSync } from "fs";
import {copySync, ensureDir,existsSync } from 'fs-extra'
import { ethers,hardhatArguments } from "hardhat";
import config from "../hardhat.config";
import { join } from "path";
import { createHardhatAndFundPrivKeysFiles } from "../helpers/localAccounts";
import * as hre from 'hardhat';
import { AllocationMock__factory, ERC20__factory, Events__factory,  PoolFactoryV1__factory,  SuperPoolHost__factory } from "../typechain-types";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { utils } from "ethers";

import { initEnv } from "../helpers/utils";
import { SuperPoolInputStruct } from "../typechain-types/SuperPoolHost";


let HOST = '0xEB796bdb90fFA0f28255275e16936D25d3418603';
let CFA = '0x49e565Ed1bdc17F3d220f72DF0857C26FA83F873';
let SUPERTOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';
let TOKEN1 = '0x15F0Ca26781C3852f8166eD2ebce5D18265cceb7';
let GELATO_OPS = '0xB3f5503f93d5Ef84b06993a1975B9D21B962892F';
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

const eventAbi:any[] = Events__factory.abi;

ensureDir(contract_path)

async function main() {

let network = hardhatArguments.network;
if (network == undefined) {
  network = config.defaultNetwork;
}

[deployer,user1] = await initEnv(hre);


if (network == "localhost") {
  // let superotkenContract = await ERC20__factory.connect(TOKEN1, deployer);
  // console.log(utils.formatEther(await superotkenContract.balanceOf(user1.address)))
  // await superotkenContract.transfer(user1.address, utils.parseEther('100'))
  // console.log(utils.formatEther(await superotkenContract.balanceOf(user1.address)))

  // let todayTimeSamp = +(new Date().getTime() / 1000).toFixed(0);
  // console.log('oldTimeStamp: ', new Date(+(todayTimeSamp)*1000).toLocaleString());
  // // await setNextBlockTimestamp(hre, todayTimeSamp);

  // // await mineBlocks(hre, 1);

  // console.log('newTimeStamp: ', new Date(+(await getTimestamp()) * 1000).toLocaleString());


}


  const contract_config = JSON.parse(readFileSync( join(processDir,'contract.config.json'),'utf-8')) as {[key:string]: ICONTRACT_DEPLOY}
  

  //// DEPLOY POOLFACTORY

  const poolFactoryImpl = await new PoolFactoryV1__factory(deployer).deploy()

  let toDeployContract = contract_config['poolFactoryV1'];
  writeFileSync(
    `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
    JSON.stringify({
      abi:  PoolFactoryV1__factory.abi.concat(eventAbi),
      name: toDeployContract.name,
      address: poolFactoryImpl.address,
      network: network,
    })
  );

  writeFileSync(
    `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
    JSON.stringify(PoolFactoryV1__factory.abi.concat(eventAbi))
  );

  console.log(toDeployContract.name + ' Contract Deployed to:', poolFactoryImpl.address);


  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));


  //// DEPLOY SuperPoolHost

  const superPoolHost = await new SuperPoolHost__factory(deployer).deploy(HOST)

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
    JSON.stringify(PoolFactoryV1__factory.abi.concat(eventAbi))
  );

  console.log(toDeployContract.name + ' Contract Deployed to:', superPoolHost.address);


  ///// copy Interfaces and create Metadata address/abi to assets folder
  copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));


  //// create superPool fdaix on mumbai
  let superInputStruct: SuperPoolInputStruct = {
    poolFactory: poolFactoryImpl.address,
    superToken: SUPERTOKEN1,
    ops: GELATO_OPS,
  };
  await superPoolHost.createSuperPool(superInputStruct);

  let superPoolTokenAddress = await superPoolHost.poolAdressBySuperToken(SUPERTOKEN1);





 //// DEPLOY Mock Allocation


 const allocationMock = await new AllocationMock__factory(deployer).deploy(superPoolTokenAddress,TOKEN1)

 toDeployContract = contract_config['allocationMock'];
writeFileSync(
  `${contract_path}/${toDeployContract.jsonName}_metadata.json`,
  JSON.stringify({
    abi:  AllocationMock__factory.abi.concat(eventAbi),
    name: toDeployContract.name,
    address: allocationMock.address,
    network: network,
  })
);

writeFileSync(
  `../add-ons/subgraph/abis/${toDeployContract.jsonName}.json`,
  JSON.stringify(PoolFactoryV1__factory.abi.concat(eventAbi))
);

console.log(toDeployContract.name + ' Contract Deployed to:', superPoolHost.address);


///// copy Interfaces and create Metadata address/abi to assets folder
copySync(`./typechain-types/${toDeployContract.name}.ts`, join(contract_path, 'interfaces', `${toDeployContract.name}.ts`));








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
