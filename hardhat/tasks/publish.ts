import { ensureDir, readFileSync, writeFileSync } from 'fs-extra';
import { task, types } from 'hardhat/config';
import { initEnv, waitForTx } from '../helpers/utils';
import { join } from 'path';

import config from '../hardhat.config';
import { dump, load } from 'js-yaml';

interface ICONTRACT_DEPLOY {
  artifactsPath: string;
  name: string;
  ctor?: any;
  jsonName: string;
}

const processDir = process.cwd();
const subgraphPath = join(processDir, '../add-ons/subgraph/');
const abiPath = join(subgraphPath, 'abis');
ensureDir(abiPath);
const srcPath = join(subgraphPath, 'src');
const contract_path_relative = '../src/assets/contracts/';
const contract_path = join(processDir, contract_path_relative);
ensureDir(contract_path);

const recursiveTypes= (inputs:Array<any>):string => {
  let typeString = "(";
  for (const input of inputs) {
  let newType = input.type;
  if (newType == 'tuple') { 
    let tupleCompo = recursiveTypes(input.components)
    typeString = typeString +  tupleCompo 
  } else {
    typeString = typeString +  newType + ','
  }


}
return typeString.substring( 0, typeString.length - 1)  + "),"
}



task('publish', 'publish subgraph')
  .addOptionalParam('reset', 'reset yaml file', false, types.boolean)
  .addOptionalParam('onlyAddress', 'only change address', false, types.boolean)
  .setAction(async (taskArgs, hre) => {
    let reset = taskArgs.reset;
    let onlyAddress = taskArgs.onlyAddress;
    {
      let network = hre.network.name;
      console.log(network);
      if (network == undefined) {
        network = config.defaultNetwork as string;
      }

      console.log(network);
      console.log(onlyAddress)
      const contract_config = JSON.parse(
        readFileSync(join(processDir, 'contract.config.json'), 'utf-8')
      ) as { [key: string]: ICONTRACT_DEPLOY };

      const deployContracts = ['floowdy'];

      // Hardhat always runs the compile task when running scripts with its command
      // line interface.
      //
      // If this script is run directly using `node` you may want to call compile
      // manually to make sure everything is compiled
      // await hre.run('compile');

      for (const toDeployName of deployContracts) {
        const toDeployContract = contract_config[toDeployName];
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

        const doc = load(
          readFileSync(join(subgraphPath, 'subgraph.yaml'), 'utf8')
        ) as any;
        const dataSources = doc['dataSources'];

        dataSources.name = toDeployContract.name;

        const contract_key = dataSources.filter(
          (fil: any) => fil.kind == 'ethereum/contract'
        )[0];
        contract_key.name = toDeployContract.name;

        const contractSource = contract_key.source;

        if (onlyAddress == false) {
          contractSource.address = metadata.address;
          contractSource.abi = toDeployContract.name;

          const contractMapping = contract_key.mapping;

          if (contractMapping.kind == 'ethereum/events') {
            /////// prepare events
            const events = metadata.abi.filter(
              (fil: any) => fil.type == 'event'
            );

            if (reset == true) {
              contractMapping.eventHandlers = [];
            }
            let yamlEvents = contractMapping.eventHandlers;

            for (const contractEvent of events) {
              const inputsStringRaw = recursiveTypes(contractEvent.inputs);

   
              
              yamlEvents.push({
                event: `${contractEvent.name}${inputsStringRaw.substring( 0, inputsStringRaw.length - 1) }`,
                handler: `handle${contractEvent.name}`,
              });
            }
            

            contractMapping.eventHandlers = yamlEvents;

            if (reset == true) {
              contractMapping.abis = [];
            }
            let abis = contractMapping.abis;

            const newAbiEntry = {
              name: toDeployContract.name,
              file: `./abis/${toDeployContract.jsonName}.json`,
            };
            if (
              abis.filter((fil: any) => fil.path == newAbiEntry.file).length ==
              0
            ) {
              abis.push(newAbiEntry);
            }

            writeFileSync(
              join(abiPath, `${toDeployContract.jsonName}.json`),
              JSON.stringify(metadata.abi)
            );
          }

          writeFileSync(join(subgraphPath, 'subgraph.yaml'), dump(doc));
        } else {
          contractSource.address = metadata.address;
          writeFileSync(join(subgraphPath, 'subgraph.yaml'), dump(doc));
        }
      }
    }
  });
