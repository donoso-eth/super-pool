export interface IPOOL_TOKEN {

    name: string; 
    superTokenName:string;
    id: number; 
    image: string; 
    token: string;
    tokenBalance?:string; 
    superToken: string;
    superTokenBalance?:string 
  };


  export interface IPOOL_STATE {
    inFlow: number,
    deposit: number,
    yieldAccrued: number,
    timestamp:number
  }


  export interface ILENS_PROFILE {
    handle: string;
    name:string
  }