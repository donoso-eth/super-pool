import { Contract, ethers, Signer} from 'ethers'
import { abi_ERC20 } from 'src/app/shared/helpers/abis/erc20';

export const  convertEtherToWei = (ether_value:number)=> {
  return (ether_value * 10 ** 18).toFixed(0);
}

export const  convertWeiToEther = (wei_value:number) => {
  return wei_value / 10 ** 18;
}

export const convertUSDtoEther = (usd_value:number,dollarExchange:number)=> {
  return usd_value / dollarExchange;
}

export const  convertEthertoUSD = (ether_value:number,dollarExchange:number) => {
  return ether_value * dollarExchange;
}

export const displayEther = (etherBalance:number)=> {
  return etherBalance.toString().substring(0, 20)
}

export const displayUsd = (usdBalance:any)=> {
  return usdBalance.toFixed(0, 2)
}

export const createERC20Instance = (ERC: string, signer: Signer): Contract => {
  return new Contract(ERC, abi_ERC20, signer);
};
