import { BigNumber, Contract, logger, utils } from 'ethers';
import { ERC20, ERC777, IOps, ISuperfluidToken, ISuperToken, PoolFactoryV2, STokenFactoryV2 } from '../../typechain-types';


export interface IPOOL {

    id:BigNumber;

    timestamp: BigNumber;
    deposit: BigNumber;
    depositFromInFlowRate: BigNumber;
  
  
    inFlowRate: BigNumber;
    outFlowRate: BigNumber;
    outFlowBuffer?:BigNumber;
  
    yieldTokenIndex: BigNumber;
    yieldInFlowRateIndex: BigNumber;
  
    yieldAccrued: BigNumber;
    yieldSnapshot: BigNumber;
    totalYield: BigNumber;
    apy :  { 
            span: BigNumber;
            apy: BigNumber; 
          }
  
  }
  

export interface IPOOL_RESULT {
    id:BigNumber;
    timestamp: BigNumber;
    poolTotalBalance: BigNumber;
  
  
    deposit: BigNumber;
    depositFromInFlowRate: BigNumber;
  
    inFlowRate: BigNumber;
    outFlowRate: BigNumber;
    outFlowBuffer:BigNumber;
  
    yieldTokenIndex: BigNumber;
    yieldInFlowRateIndex: BigNumber;
  
  
    yieldAccrued: BigNumber;
    yieldSnapshot: BigNumber;
    totalYield: BigNumber;
    apySpan: BigNumber;
    apy: BigNumber;
  
  }
  
export interface IPOOLS_RESULT {[key:number]:IPOOL_RESULT};


  export interface IUSER_CHECK {
    name: string;
    result: IUSER_RESULT;
    expected: IUSER_RESULT;
  
  }
  
  export interface IUSER_RESULT {
    id:BigNumber,
    realTimeBalance: BigNumber;

    tokenBalance:BigNumber;
    deposit: BigNumber;
    timestamp: BigNumber;
    inFlow:BigNumber;
    inFlowId?: string
    nextExecIn?:BigNumber
    
    outFlow: BigNumber;
    outStepAmount: BigNumber;
    outStepTime: BigNumber;
    outMinBalance: BigNumber;
    outStreamId?: string;
    nextExecOut?:BigNumber;
  }
  
  export interface IUSERTEST {address:string, name: string,expected: IUSER_RESULT}
  
 export interface IUSERS_TEST {[key:string]:IUSERTEST} 


  export interface ICONTRACTS_TEST  {
    poolAddress: string,
     superTokenContract: ISuperToken, 
     superPool:PoolFactoryV2,
     superTokenERC777: ERC777,
     ops?:IOps,
     sToken: STokenFactoryV2
    }
  

    export enum SupplierEvent {
      DEPOSIT,// uint256
      WITHDRAW, // uint256
      STREAM_START, //int96
      STREAM_STOP, //
      OUT_STREAM_START, //int96
      OUT_STREAM_STOP, //
      PUSH_TO_STRATEGY, //uint256
    }