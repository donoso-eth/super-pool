import { BytesLike, Contract, ContractReceipt, ContractTransaction, Signer, Wallet } from 'ethers';
import { ensureDir } from 'fs-extra';
import { HardhatNetworkAccountConfig, HardhatNetworkAccountsConfig, HardhatNetworkConfig, HardhatRuntimeEnvironment } from 'hardhat/types';
import { join } from 'path';


export function getHardhatNetwork(hre: HardhatRuntimeEnvironment) {
  let network = hre.hardhatArguments.network;
  if (network == undefined) {
    network = hre.network.name;
  }
  return network;
}

export async function waitForTx(tx: Promise<ContractTransaction>):Promise<ContractReceipt> {
 return await (await tx).wait();

}

export async function deployContract(tx: any): Promise<Contract> {
  const result = await tx;
  await result.deployTransaction.wait();
  return result;
}


export async function initEnv(hre: HardhatRuntimeEnvironment): Promise<any[]> {
  let network = getHardhatNetwork(hre);
  if (network == 'localhost') {
    const ethers = hre.ethers; // This allows us to access the hre (Hardhat runtime environment)'s injected ethers instance easily
    const accounts = await ethers.getSigners(); // This returns an array of the default signers connected to the hre's ethers instance
    const deployer = accounts[0];
    const user1 = accounts[1];
    const user2 = accounts[2];
    const user3 = accounts[3];
    const user4 = accounts[4];

    return [deployer, user1, user2, user3, user4];
  } else {
    const deployer_provider = hre.ethers.provider;
    const privKeyDEPLOYER = process.env['DEPLOYER_KEY'] as BytesLike;
    const deployer_wallet = new Wallet(privKeyDEPLOYER);
    const deployer = await deployer_wallet.connect(deployer_provider);

    // const privKeyUSER = process.env['USER1_KEY'] as BytesLike;
    // const user_wallet = new Wallet(privKeyUSER);
    // const user1 = await user_wallet.connect(deployer_provider);

    // const privKeyUSER2 = process.env['USER2_KEY'] as BytesLike;
    // const user2_wallet = new Wallet(privKeyUSER2);
    // const user2 = await user2_wallet.connect(deployer_provider);

    // const privKeyUSER3 = process.env['USER3_KEY'] as BytesLike;
    // const user3_wallet = new Wallet(privKeyUSER3);
    // const user3 = await user3_wallet.connect(deployer_provider);

    // const privKeyUSER4 = process.env['USER4_KEY'] as BytesLike;
    // const user4_wallet = new Wallet(privKeyUSER4);
    // const user4 = await user4_wallet.connect(deployer_provider);

    return [deployer];
  }
}

export function getAssetsPath(contract_path_relative:string) {
const processDir = process.cwd()
const contract_path = join(processDir,contract_path_relative)
ensureDir(contract_path)
return contract_path
}


export async function impersonateAccount(hre:HardhatRuntimeEnvironment, account:string):Promise<Signer> {

  await hre.network.provider.request({
    method: "hardhat_impersonateAccount",
    params: [account],
  });

  const signer = await hre.ethers.getSigner(account)
  return signer

}


export async function resertHardhat(hre:HardhatRuntimeEnvironment, ):Promise<void> {

  await hre.network.provider.request({
    method: "hardhat_reset",
    params: [],
  });

}


export async function forwardChainTime(
  hre: HardhatRuntimeEnvironment,
  INCREASE_PERIOD: number
): Promise<void> {
  await hre.network.provider.send('evm_increaseTime', [INCREASE_PERIOD + 1]);
}

export async function mineBlocks(
  hre: HardhatRuntimeEnvironment,
  nrOfBlocks: number
) {
  for (let i = 1; i <= nrOfBlocks; i++) {
    await hre.network.provider.request({
      method: 'evm_mine',
      params: [],
    });
  }
}


export async function setNextBlockTimestamp(hre: HardhatRuntimeEnvironment,timestamp: number): Promise<void> {
  await hre.ethers.provider.send('evm_setNextBlockTimestamp', [timestamp]);
}
