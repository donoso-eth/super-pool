import { Injectable } from '@angular/core';
import { DappInjector, settings, Web3Actions, } from 'angular-web3';
import { constants, Contract, ethers, Signer, utils } from 'ethers';
import { doSignerTransaction } from 'src/app/dapp-injector/classes/transactor';
import {
  createERC20Instance,
  createSupertokenInstance,
} from '../helpers/helpers';
import { ISuperToken } from 'src/assets/contracts/interfaces/ISuperToken';

import { IPOOL_STATE, IPOOL_TOKEN } from '../models/models';

import { Store } from '@ngrx/store';
import { SuperFluidService } from 'src/app/dapp-injector/services/super-fluid/super-fluid-service.service';

@Injectable({
  providedIn: 'root',
})
export class GlobalService {
  erc20?: ethers.Contract;
  supertoken?: ISuperToken;
  public poolState!: IPOOL_STATE;
  public poolToken: IPOOL_TOKEN = {
    name: 'fUSDC',
    superTokenName: 'fUSDCx',
    id: 1,
    image: 'usdc',
    superToken: settings.localhost.supertoken,
    superTokenBalance: '0',
    token: settings.localhost.token,
    tokenBalance: '0',
  };

  constructor(
    public dapp: DappInjector,
    public superfluid: SuperFluidService,
    public store:Store
  ) {}

  async getPoolToken(): Promise<{poolToken:IPOOL_TOKEN, poolState:IPOOL_STATE}> {
    await this.getBalances();
    return  { poolToken:this.poolToken,poolState:this.poolState};
  }

  getTokenInstance() {
    if (this.erc20 == undefined) {
      this.erc20 = createERC20Instance(
        this.poolToken.token,
        this.dapp.signer as Signer
      );
    }
  }

  getSuperTokenInstance() {
    if (this.supertoken == undefined) {
      this.supertoken = createSupertokenInstance(
        this.poolToken.superToken,
        this.dapp.signer as Signer
      ) as ISuperToken;
    }
  }

  async getBalances() {
    this.getTokenInstance();
    this.getSuperTokenInstance();

    console.log(this.dapp.signerAddress);

    let balance = this.erc20?.balanceOf(this.dapp.signerAddress);
    let superbalance = (this.supertoken as ISuperToken).realtimeBalanceOfNow(
      this.dapp.signerAddress as string
    );

    let result = await Promise.all([balance, superbalance]);

    let poolbalance = await this.supertoken?.balanceOf(
      this.dapp.defaultContract?.address!
    );


    this.poolToken.superTokenBalance = (+utils.formatEther(
      result[1].availableBalance
    )).toFixed(4);
    this.poolToken.tokenBalance =  (+utils.formatEther(
      result[0]
    )).toFixed(4);

 


    await this.getPoolState()

  }

  prepareNumbers(balance: number) {
    const niceTwo =  (Math.trunc(balance / 10 ** 18 *100)/100).toString();
    let twoDec = niceTwo;

    const niceFour = (balance / 10 ** 18).toFixed(6);

    let fourDec = niceFour.substring(niceFour.length - 4, niceFour.length);
    return { twoDec, fourDec };
  }

  async mint() {
    // this.getBalances()

    // let signer = this.dapp.signer as Signer;

    console.log(this.dapp.signerAddress);

    // let balance = await this.erc20?.balanceOf(this.dapp.defaultContract?.address);

    //  console.log(balance.toString());

    const value = utils.parseEther('1000').toString();
    await doSignerTransaction(
      (this.erc20 as Contract).connect(this.dapp.signer!)['mint(address,uint256)'](this.dapp.signerAddress,value)
    );
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'Approving the supertoken contract', header:'Un momento'}}))

    await doSignerTransaction(
      (this.erc20 as Contract).connect(this.dapp.signer!).approve(
        this.supertoken?.address,
        constants.MaxUint256
      )
    );
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'Upgrading the usdc tokens to supertokens', header:'Un momento más'}}))

   
    await doSignerTransaction((this.supertoken as ISuperToken).connect(this.dapp.signer!).upgrade(value));

    // console.log(this.dapp.defaultContract?.address)

    // balance =await  this.erc20?.balanceOf(this.dapp.defaultContract?.address);
    // console.log(balance.toString())
    // await doSignerTransaction( (this.erc20 as Contract).transfer(this.dapp.defaultContract?.address,amount))

    // balance =await  this.erc20?.balanceOf(this.dapp.defaultContract?.address);
    // console.log(balance.toString())

    //await doSignerTransaction((this.dapp.defaultContract?.instance as Floowdy).deposit())
  }

  // #region  ====================== pool state ========================

  async getPoolState(): Promise<IPOOL_STATE> {

    let resultFlow = await this.superfluid.getFlow({
      sender: this.dapp.signerAddress!,
      receiver: this.dapp.defaultContract?.address!,
      superToken: this.poolToken.superToken,
    });

    this.poolState = { inFlow: +resultFlow.flowRate, deposit: +resultFlow.deposit, yieldAccrued:0, timestamp:+resultFlow.timestamp};


    return this.poolState; 
  
  }

  // #endregion  ====================== pool state ========================
}
