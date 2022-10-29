export interface ISUPPLIER_QUERY {
  id: string;
  supplier: string;
  timestamp: string;
  createdTimestamp: string;

  deposit: string;

  cumulatedYield: string;

  inFlow: string;
  inCancelFlowId: string;

  outFlow: string;
  outCancelFlowId: string;
  outStepAmount: string;
  outStepTime: string;
  outInitTime: string;
  outMinBalance: string;
  outCancelWithdrawId: string;

  apySpan: string;
  apy: string;
}

export enum CreditStatus {
  NONE,
  PHASE1,
  PHASE2,
  PHASE3,
  PHASE4,
  APPROVED,
  REJECTED,
  CANCELLED,
  REPAYED,
  LIQUIDATED
}



 export interface IPOOL {
  id:string;
  timestamp: string;
  deposit: string;
  depositFromInflowRate:string;
  inFlowRate:string;
  outFlowRate:string;
  outFlowBuffer:string;
  totalYield:string;
  yieldTokenIndex:string;
  yieldInFlowRateIndex:string;

  yieldAccrued:string;
  yieldSnapshot:string;
  nrSuppliers:string;
  apySpan: string;
  apy: string;
 }