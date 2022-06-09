import { Contract, providers, Signer, utils } from "ethers";
import { readFileSync } from "fs-extra";
import { initEnv, waitForTx } from "../helpers/utils";
import { SuperPoolHost__factory } from "../typechain-types";
import { join } from "path";
import * as hre from "hardhat";
import { SuperPoolInputStruct } from "../typechain-types/SuperPoolHost";

let TOKEN1 = '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f';

const contract_path_relative = '../src/assets/contracts/';
const processDir = process.cwd()
const contract_path = join(processDir,contract_path_relative)
const contract_config = JSON.parse(readFileSync( join(processDir,'contract.config.json'),'utf-8')) as {[key:string]: any}


const tinker = async () => {

  const [deployer] = await initEnv(hre)

  console.log(deployer.address)

    // ADDRESS TO MINT TO:
 let deployContract="superPoolHost"
  let toDeployContract = contract_config[deployContract];
 let superPoolHostMetadata = JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`,'utf-8'))
  
  deployContract="poolFactory"
  toDeployContract = contract_config[deployContract];
  let poolFactotyMetadata = JSON.parse(readFileSync(`${contract_path}/${toDeployContract.jsonName}_metadata.json`,'utf-8'))



  console.log(poolFactotyMetadata.address)
  const superPoolHost = SuperPoolHost__factory.connect(superPoolHostMetadata.address, deployer)


  let PoolInput: SuperPoolInputStruct = {
    poolFactory: poolFactotyMetadata.address,
    superToken:TOKEN1
  }

  //const poolInput = input

  let  receipt = await waitForTx( superPoolHost.createSuperPool(PoolInput));
  
  
  };
  
  const sleep = (ms:number) => {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  tinker()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });