import * as dotenv from 'dotenv';

import { HardhatUserConfig, task } from 'hardhat/config';
import '@nomiclabs/hardhat-etherscan';
import '@nomiclabs/hardhat-waffle';
import '@typechain/hardhat';
import 'hardhat-gas-reporter';
import "hardhat-contract-sizer";
import 'solidity-coverage';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import * as glob from 'glob';
import { resolve } from 'path';

const INFURA_ID = 'YOUR KEY'; //process.env["INFURA_ID"]
const MORALIS_ID = 'YOUR KEY'; //process.env["MORALIS_ID"]
const ALCHEMY_ID_MUMBAI = 'YOUR KEY'; //process.env["ALCHEMY_ID_MUMBAI"]

dotenv.config();

//// import task files when types have already been created
if (existsSync('./typechain-types')) {
  glob.sync('./tasks/**/*.ts').forEach(function (file: any) {
    require(resolve(file));
  });
}


// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more

const mainnetGwei = 21;


let defaultNetwork = 'localhost';
//defaultNetwork = 'goerli';
//deafultNEtwork = 'optgoerli'
const config: HardhatUserConfig = {
  solidity: {
    version: '0.8.17',
    settings: {
      optimizer: {
        enabled: true,
        runs: 1000,
      },
    },
  },
  defaultNetwork,
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      forking: {
        url: `https://goerli.infura.io/v3/1e43f3d31eea4244bf25ed4c13bfde0e`,
        blockNumber: 7850256
        },  
        chainId: 1337
    },
    localhost: {
      url: 'http://localhost:8545',
      chainId: 1337,
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_ID}`, // <---- YOUR INFURA ID! (or it won't work)
      //`https://speedy-nodes-nyc.moralis.io/${MORALIS_ID}/eth/mainnet`

      gasPrice: mainnetGwei * 1000000000,
          accounts:
        process.env['DEPLOYER_KEY'] !== undefined
          ? [process.env['DEPLOYER_KEY']]
          : [],
    },
    goerli: {
      url: `https://goerli.infura.io/v3/1e43f3d31eea4244bf25ed4c13bfde0e`, // <---- YOUR INFURA ID! (or it won't work)
      gasPrice: 1000000000,   
      accounts:
        process.env['DEPLOYER_KEY'] !== undefined
          ? [process.env['DEPLOYER_KEY']]
          : [],
    },
    optgoerli: {
      url: 'https://optimism-goerli.infura.io/v3/1e43f3d31eea4244bf25ed4c13bfde0e',
      gasPrice: 1000000000,
          accounts:
        process.env['DEPLOYER_KEY'] !== undefined
          ? [process.env['DEPLOYER_KEY']]
          : [],
    },
    polygon: {
      url: 'https://speedy-nodes-nyc.moralis.io/XXXXXXXXXXXXXXXXXXXx/polygon/mainnet', // <---- YOUR MORALIS ID! (not limited to infura)
      //https://polygon-rpc.com
      gasPrice: 1000000000,
          accounts:
        process.env['DEPLOYER_KEY'] !== undefined
          ? [process.env['DEPLOYER_KEY']]
          : [],
    },
    mumbai: {
      url: process.env.MUMBAI_URL || "", // <---- YOUR MORALIS ID! (not limited to infura)
      // `https://polygon-mumbai.g.alchemy.com/v2/${ALCHEMY_ID_MUMBAI}`
      gasPrice: 1000000000,
          accounts:
        process.env['DEPLOYER_KEY'] !== undefined
          ? [process.env['DEPLOYER_KEY']]
          : [],
    },

    matic: {
      url: 'https://rpc-mainnet.maticvigil.com/',
      gasPrice: 1000000000,
          accounts:
        process.env['DEPLOYER_KEY'] !== undefined
          ? [process.env['DEPLOYER_KEY']]
          : [],
    },
  },
  gasReporter: {
    enabled: process.env['REPORT_GAS'] !== undefined,
    currency: 'USD',
  },
  etherscan: {
    apiKey: process.env['ETHERSCAN_API_KEY'],
  },
  mocha: {
    timeout: 100000000
  },
};

export default config;
