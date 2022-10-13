import { Contract, Signer, utils } from "ethers";
import { abi_ERC777 } from "../components/user-balance/abis/erc777";
import { abi_ERC20 } from "./abis/erc20";
import { abi_supertoken } from "./abis/superToken";


export const displayAdress= (address: string): string => {
    return (
      address.slice(0, 5) +
      '...' +
      address.slice(address.length - 5, address.length)
    );
  }

  export const isAddress = (address: string) => {
    try {
      utils.getAddress(address);
    } catch (e) {
      return false;
    }
    return true;
  };


  export const blockTimeToTime =(timestamp:number) => {
      let utcTime = new Date(timestamp*1000);
      return utcTime.toLocaleString()

  }

  export const createERC20Instance = (ERC: string, signer: Signer): Contract => {
    return new Contract(ERC, abi_ERC20, signer);
  };
  
  export const createSupertokenInstance = (ERC: string, signer: Signer): Contract => {
    return new Contract(ERC, abi_supertoken , signer);
  };
  

  export const createERC777Instance = (ERC: string, signer: Signer): Contract => {
    return new Contract(ERC, abi_ERC777, signer);
  };
  
  export const formatSmallEther = (value:number) => {
    return (value/10**6).toFixed(4)
  }