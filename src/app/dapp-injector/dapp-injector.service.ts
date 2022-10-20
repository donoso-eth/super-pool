import { DOCUMENT } from '@angular/common';
import { Inject, Injectable, OnDestroy } from '@angular/core';
import { Store } from '@ngrx/store';

import { Contract, providers, Wallet } from 'ethers';

import { netWorkById, NETWORKS, settings } from './constants/constants';
import { DappConfigService } from './dapp-injector.module';

import { ICONTRACT_METADATA, IDAPP_CONFIG, IDAPP_STATE,  ITRANSACTION_DETAILS, ITRANSACTION_RESULT } from './models';
import { Web3Actions, web3Selectors } from './store';

import { JsonRpcProvider, Web3Provider } from '@ethersproject/providers';
import { Web3ModalComponent } from './web3-modal/web3-modal.component';
import { Subject, takeUntil } from 'rxjs';
import { SuperPool} from 'src/assets/contracts/interfaces/SuperPool';
import { AngularContract } from './classes';
import HostMetadata from 'src/assets/contracts/super_pool_host_metadata.json';
import PoolMetadata from 'src/assets/contracts/pool_v2_metadata.json';
import StokenMetadata from 'src/assets/contracts/s_token_v2_metadata.json';

import { PoolV2 } from 'src/assets/contracts/interfaces/PoolV2';
import { STokenV2 } from 'src/assets/contracts/interfaces/STokenV2';

@Injectable({
  providedIn: 'root',
})
export class DappInjector implements OnDestroy {
  
  private destroyHooks: Subject<void> = new Subject();

  ///// ---------  DAPP STATE INITIALIZATION
  DAPP_STATE:IDAPP_STATE<PoolV2, STokenV2> = {
   
    defaultProvider: null,
    connectedNetwork: null,

    signer:null,
    signerAddress:null,

    defaultContract:  null,
    sTokenContract: null,
    viewContract:null,

  }

  ///// ---------  WEB3Modal for wallet conneciton
  private webModal!: Web3ModalComponent;

 ///// ---------  importing local priv_keys
  harhdat_local_privKeys:Array<{key:string, address:string}> = [];;


  constructor(
    @Inject(DappConfigService) public dappConfig: IDAPP_CONFIG,
    @Inject(DOCUMENT) private readonly document: any,
    private store: Store
  ) {
    ///// ---------  Blockchain Bootstrap
    this.dappBootstrap();
  }

  ///// ---- -----  Launching webmodal when chain is disconnected
  async launchWebModal() {
    if (this.dappConfig.wallet !== 'wallet') {
      this.dappBootstrap();
    } else {
      await this.webModal.connectWallet();
    }
  }

  ///// ---------  B Bootstrap
 private async dappBootstrap() {

  try {
    

    ///// ---------  Initializaing the default read provider, congif from startUpCOnfig, nerwork details from xxxx
    this.DAPP_STATE.defaultProvider = await this.providerInitialization() as JsonRpcProvider;

  
    /// todo launch read contract async not required to await

    ///// ---------  Signer Initialization in order to xxxxxx

    switch (this.dappConfig.wallet) {
      case 'wallet':
        const walletResult = await this.walletInitialization();

        this.DAPP_STATE.signer = walletResult.signer;
        this.DAPP_STATE.defaultProvider = walletResult.provider;

        this.webModalInstanceLaunch()

        break;

      case 'local':
        ////// local wallet

        this.harhdat_local_privKeys = (await import('../../assets/contracts/local_accouts.json')).default;
        
        let wallet:Wallet = new Wallet(this.harhdat_local_privKeys[0].key);
        this.DAPP_STATE.signer = await wallet.connect(this.DAPP_STATE.defaultProvider!);
        this.DAPP_STATE.signerAddress = this.harhdat_local_privKeys[0].address //await this.DAPP_STATE.signer.getAddress()

      
        break;

      case 'privKey':
        let privateWallet: Wallet;
        let privKey = ''; //environment.privKey
        privateWallet = new Wallet(privKey);
        this.DAPP_STATE.signer = await privateWallet.connect(this.DAPP_STATE.defaultProvider);
        this.DAPP_STATE.signerAddress = await this.DAPP_STATE.signer.getAddress()
       
        break;
    }


    this.contractInitialization();
    
  } catch (error) {
      console.log(error)
  }

  }

//// Local wallet initizlization
async localWallet(index:number) {

  console.log(index)
  this.store.dispatch(Web3Actions.chainBusy({ status: true }));
  this.store.dispatch(Web3Actions.chainStatus({status: 'loading'}))
  console.log(this.harhdat_local_privKeys[index-1])
  let wallet:Wallet = new Wallet(this.harhdat_local_privKeys[index-1].key);
  this.DAPP_STATE.signer = await wallet.connect(this.DAPP_STATE.defaultProvider!);
  this.DAPP_STATE.signerAddress = await this.DAPP_STATE.signer.getAddress()
  this.contractInitialization();

}


  ///// ---------  Provider Initialization or THROW if NOT CONNECTION
 private  async providerInitialization(): Promise<JsonRpcProvider> {
    const hardhatProvider = await this.createProvider([NETWORKS[this.dappConfig.defaultNetwork].rpcUrl]);

    try {
      const network = await hardhatProvider.getNetwork();
      console.log('I am connected to ' + network);
    } catch (error) {
      this.store.dispatch(Web3Actions.chainStatus({ status: 'fail-to-connect-network' }));
      this.store.dispatch(Web3Actions.chainBusy({ status: false }));
      throw new Error("FAIL_TO_CONNECT_NETWORK");
      
    }
    return  hardhatProvider ;
  }

  ///// ---------  Signer Initialization
 private  async walletInitialization() {
    //// Wallet Configuration

    //// Check if metamask/wallet already available
    console.log('Check if 🦊 injected provider');
    let ethereum = (window as any).ethereum;

    /////  check if Metamast is present in the browwser
    if (!!(window as any).ethereum) {
      const metamaskProvider = new providers.Web3Provider(ethereum, 'any');

      const addresses = await metamaskProvider.listAccounts();

      if (addresses.length > 0) {
        const providerNetwork = metamaskProvider && (await metamaskProvider.getNetwork());
        const metamaskSigner = await metamaskProvider.getSigner();
        this.DAPP_STATE.signerAddress = await metamaskSigner.getAddress()
        return {
          signer: metamaskSigner,
          provider: metamaskProvider,
        };
      } else {
        this.store.dispatch(Web3Actions.chainStatus({ status: 'wallet-not-connected' }));
        this.store.dispatch(Web3Actions.chainBusy({ status: false }));
        throw new Error("WALLET_NOT_CONNECTED");
        
      }
    } else {
      /////  NO metamask
      this.store.dispatch(Web3Actions.chainStatus({ status: 'wallet-not-connected' }));

      this.store.dispatch(Web3Actions.chainBusy({ status: false }));
      throw new Error("WALLET_NOT_CONNECTED");
    }
  }

  ///// ---------  Contract Initialization
  private async contractInitialization() {


    let hostContract = new Contract(HostMetadata.address, HostMetadata.abi,this.DAPP_STATE.signer!) ;
    let resolver = await hostContract.getResolverBySuperToken(settings.goerli.supertoken);

    console.log(resolver);

    PoolMetadata.address = resolver.pool

    const contract = new AngularContract<PoolV2>({
     metadata:  PoolMetadata,
      provider: this.DAPP_STATE.defaultProvider!,
      signer: this.DAPP_STATE.signer!,
    });

    await contract.init()


    StokenMetadata.address = resolver.sToken;
    console.log(resolver.sToken)
    const contractStoken = new AngularContract<STokenV2>({
      metadata:   StokenMetadata,
       provider: this.DAPP_STATE.defaultProvider!,
       signer: this.DAPP_STATE.signer!,
     });
 
     await contractStoken.init()
 
    this.DAPP_STATE.defaultContract = contract;
     this.DAPP_STATE.sTokenContract = contractStoken;



    const providerNetwork = await this.DAPP_STATE.defaultProvider!.getNetwork();

    const networkString = netWorkById(providerNetwork.chainId)?.name as string;
    console.log(networkString);
    this.DAPP_STATE.connectedNetwork = networkString;
    this.store.dispatch(Web3Actions.setSignerNetwork({ network: networkString }));

    this.store.dispatch(Web3Actions.chainStatus({ status: 'wallet-connected' }));
    this.store.dispatch(Web3Actions.chainBusy({ status: false }));
  }


  /////// ------ Instanciate Web modal

  private async webModalInstanceLaunch(){
     ///// create web-modal/hoos for connection/disconection .etcc.....
     this.webModal = new Web3ModalComponent({ document: this.document }, this.store);

     await this.webModal.loadWallets();
     this.webModal.onConnect.pipe(takeUntil(this.destroyHooks)).subscribe(async (walletConnectProvider) => {
       this.store.dispatch(Web3Actions.chainStatus({ status: 'fail-to-connect-network' }));
       this.store.dispatch(Web3Actions.chainBusy({ status: true }));

       const webModalProvider = new providers.Web3Provider(walletConnectProvider);
       const webModalSigner = await webModalProvider.getSigner();
       this.DAPP_STATE.signerAddress = await webModalSigner.getAddress()
       this.DAPP_STATE.defaultProvider = webModalProvider;
       this.DAPP_STATE.signer = webModalSigner;

       
       this.contractInitialization();
     });

     ////// TODO WHEN CHANGING NETWORK or USER
     
     ////// On Metamask disconnectind
     this.webModal.onDisConnect.pipe(takeUntil(this.destroyHooks)).subscribe(() => {
       console.log('i am disconnecting');
       this.store.dispatch(Web3Actions.chainStatus({ status: 'fail-to-connect-network' }));
       this.store.dispatch(Web3Actions.chainBusy({ status: false }));
     });

     ///// Disconnecting manually.....
     this.store.pipe(web3Selectors.hookForceDisconnect).pipe(takeUntil(this.destroyHooks)).subscribe(() => {
       console.log('i amdisconencting manually');
       this.store.dispatch(Web3Actions.chainStatus({ status: 'disconnected' }));
       this.store.dispatch(Web3Actions.chainBusy({ status: false }));
       this.DAPP_STATE.signer = null;
       this.DAPP_STATE.signerAddress = null;
       this.DAPP_STATE.defaultContract = null;
       this.DAPP_STATE.defaultProvider = null;
     });

  }

  /////// VIEW FUCNTIONS

  get signer() {
    return this.DAPP_STATE.signer
  }

  get signerAddress() {
    return this.DAPP_STATE.signerAddress
  }

  get provider() {
    return this.DAPP_STATE.defaultProvider
  }


  get connectedNetwork() {
    return this.DAPP_STATE.connectedNetwork
  }

  get defaultContract() {
    return this.DAPP_STATE.defaultContract
  }

  get defaultContractInstance() {
    return this.DAPP_STATE.defaultContract?.instance
  }
 
  async createProvider(url_array: string[]) {
    let provider;
    if (url_array.length == 0) {
      provider = new providers.JsonRpcProvider();
    } else {
      const p_race = await Promise.race(url_array.map((map) => new providers.JsonRpcProvider(map)));
      provider = await p_race;
    }

    //this._signer = this._provider.getSigner();
    return provider;
  }



  ngOnDestroy(): void {
    this.destroyHooks.next();
    this.destroyHooks.complete();
  }


}
