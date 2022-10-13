export interface Web3State {
    chainStatus: NETWORK_STATUS;
    busyNetwork:boolean;
    busyMessage: { header:string, body:string},

    readContactReady:boolean
    signerNetwork:string;

    //
    walletBalance:number;
    etherToDollar:number;

    refreshBalance:boolean;
    
  }

  export type NETWORK_STATUS = 'loading' | 'fail-to-connect-network' | 'wallet-not-connected' | 'wallet-connected' | 'disconnected' | 'force-disconnect';

  