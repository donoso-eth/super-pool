import { BigNumber, Contract, logger, utils } from 'ethers';
import { ERC20,  IERC20, IERC777, IOps, ISuperfluidToken, ISuperToken, PoolInternalV1, PoolV1, STokenV1 } from '../../typechain-types';


export interface IPOOL {

    id:BigNumber;

    timestamp: BigNumber;
    deposit: BigNumber;
    depositFromInFlowRate: BigNumber;
    depositFromOutFlowRate: BigNumber;
  
  
    inFlowRate: BigNumber;
    outFlowRate: BigNumber;
    outFlowBuffer:BigNumber;
    yieldObject : {
    yieldTokenIndex: BigNumber;
    yieldInFlowRateIndex: BigNumber;
    yieldOutFlowRateIndex: BigNumber;
  
    yieldAccrued: BigNumber;
    yieldSnapshot: BigNumber;
    totalYield: BigNumber;
    }
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
    inFlowDeposit:BigNumber;
    inFlowId?: string
    nextExecIn?:BigNumber
    
    outFlow: BigNumber;
    outStepAmount: BigNumber;
    outStepTime: BigNumber;
    outMinBalance: BigNumber;
    outStreamId: string;
    outStreamCreated: BigNumber;
    outStreamInit: BigNumber;
    nextExecOut:BigNumber;
  }
  
  export interface IUSERTEST {address:string, name: string,expected: IUSER_RESULT}
  
 export interface IUSERS_TEST {[key:string]:IUSERTEST} 


  export interface ICONTRACTS_TEST  {
    poolAddress: string,
     superTokenContract: ISuperToken, 
     superPool:PoolV1,
     poolInternal: PoolInternalV1,
     superTokenERC777: IERC777,
     ops?:IOps,
     strategyAddresse: string,
     aaveERC20:IERC20,
     PRECISSION: BigNumber
    }
  

    export enum SupplierEvent {
      DEPOSIT,// (uint256)
      WITHDRAW, // (uint256)
      TRANSFER,// (address.uint256)
      STREAM_START, //(int96)
      STREAM_STOP, //
      OUT_STREAM_START, //(int96)
      OUT_STREAM_STOP, //
      OUT_STREAM_UPDATE, //(int96)
      PUSH_TO_STRATEGY, //(uint256)
      WITHDRAW_STEP,//
      REBALANCE //
    }


    export interface NetworkObject {
      poolImpl: string;
      poolInternalImpl: string;
      poolStrategyImpl: string;
      poolFactoryImpl: string;
      poolProxy: string;
      poolInternalProxy: string;
      poolStrategyProxy: string;
      poolFactoryProxy: string;
    };