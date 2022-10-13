export interface IMEMBER_QUERY {
  deposit: string;
  flow: string;
  timestamp:string;
  amountLocked: string;
  amountLoss:string;
  creditsRequested: Array<ICREDIT_REQUESTED>
  creditsDelegated: Array<ICREDIT_DELEGATED>;
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


export interface ICREDIT_DELEGATED {
  id: string;
  amount: string;
  rateAave: string;
  ratePool: string;
  status: string;
  finishPhaseTimestamp:string,
  delegatorsAmount:string,
  delegatorsRequired:string;
  requester: { member:string};
  delegators: Array<{member: { member:string}}>;
  delegatorsNr: string;
  interval:string;
  currentInstallment:string;
  installment:string;
  installments:Array<{timestamp:string, nr:string}>
  nextInstallment:{timestamp:string, nr:string};
  nrInstallments:string;

}

export interface ICREDIT_REQUESTED  {
  finishPhaseTimestamp: string;
  amount: string;
  status: string;
  rate: string;
  delegatorsNr: string;
};
 export type ROLE = 'member' | 'requester' |'delegater' | 'none' |'loading'


 export interface IPOOL {
  id:string;
  timestamp: string,
  totalDeposit: string;
  totalFlow:string;
  totalYieldStake:string;
  totalYieldCredit:string;
  totalDelegated:String;
  nrMembers:string;
 }