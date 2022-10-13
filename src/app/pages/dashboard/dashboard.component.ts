import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { DappBaseComponent, DappInjector, Web3Actions, IMEMBER_QUERY } from 'angular-web3';
import { utils } from 'ethers';
import { MessageService } from 'primeng/api';
import { interval, takeUntil, async, Subject } from 'rxjs';
import { doSignerTransaction } from 'src/app/dapp-injector/classes/transactor';
import { GraphQlService } from 'src/app/dapp-injector/services/graph-ql/graph-ql.service';
import { mockMember1 } from 'src/app/dapp-injector/services/graph-ql/mockQueries';
import { SuperFluidService } from 'src/app/dapp-injector/services/super-fluid/super-fluid-service.service';
import { IPOOL_STATE, IPOOL_TOKEN } from 'src/app/shared/models/models';
import { ERC777Service } from 'src/app/shared/services/erc777.service';

import { GlobalService } from 'src/app/shared/services/global.service';

@Component({
  selector: 'app-dashboard',
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.scss'],
})
export class DashboardComponent extends DappBaseComponent implements OnInit, OnDestroy {
  balanceSupertoken = 0;
  poolToken?: IPOOL_TOKEN;
  poolState!: IPOOL_STATE;
  twoDec: string = "00";
  fourDec: string = "0000";
  twoDecAva: string = "00";
  fourDecAva: string = "0000";
  isFlowAvailable = false;

  destroyQueries: Subject<void> = new Subject();
  destroyFormatting: Subject<void> = new Subject();

  depositAmountCtrl = new FormControl('', [
    Validators.required,
    Validators.min(1),
  ]);

  member!:IMEMBER_QUERY;

  memberDisplay: any;  
  niceFlow!: string;

  constructor(
    store: Store,
    dapp: DappInjector,
    public router: Router,
    public formBuilder: FormBuilder,
    public global: GlobalService,
    private graphqlService: GraphQlService,
    public erc777: ERC777Service,
    public msg: MessageService,
    public superFluidService:SuperFluidService
  ) {
    super(dapp, store);
  }

  showStartFlow() {
    this.router.navigateByUrl('start-flow');
  }

 async stopFlow(){
  this.store.dispatch(Web3Actions.chainBusy({ status: true }));
  this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'stopping your flow', header:'Un momento'}}))
  await this.superFluidService.stopStream({
    receiver:this.dapp.defaultContract?.address!,
    superToken:this.global.poolToken.superToken,

    data:"0x"
  })
  
      
  }

  async wrapp() {}

  async mint() {
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'Minting your tokens', header:'Un momento'}}))
    await this.global.mint();
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'Querying your balances', header:'Un momento'}}))
    await this.refreshBalance();
    this.store.dispatch(Web3Actions.chainBusy({ status: false }));
  }

  async withdraw() {
  
    let amount = utils.parseEther(this.depositAmountCtrl.value.toString());
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'it is ok to need hte money....', header:'Un momento'}}))
    await doSignerTransaction(this.dapp.defaultContract?.instance?.memberWithdraw(amount)!)
  
  }

  async deposit() {
    if (this.depositAmountCtrl.invalid) {
      this.msg.add({
        key: 'tst',
        severity: 'error',
        summary: 'OOPS',
        detail: `Value minimum to deposit 1 token`,
      });

      return;
    }

    let amount = utils.parseEther(this.depositAmountCtrl.value.toString());

    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'Yes, yes your deposit is on the way', header:'Un momento'}}))
    await  this.erc777.depositIntoPool(amount);
  

      await this.refreshBalance();
     // await this.getMember();
    

  
  }

  async refreshBalance() {
    let result = await this.global.getPoolToken();

    this.poolToken = result.poolToken;
    this.poolState = result.poolState;



  }

  ngOnInit(): void {
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message:{header:'A momnet...',body:'we are fetching last data for you'}}))
    if (this.blockchain_status == 'wallet-connected'){
     // this.getMember()
 
    }

  }

  requestCredit() {
    this.router.navigateByUrl('request-credit');
  }

  async getMember() {
  
    this.destroyQueries.next()
   this.graphqlService
        .watchMember(this.dapp.signerAddress!)
        .pipe(takeUntil(this.destroyQueries))
        .subscribe((val: any) => {
     


          if (!!val && !!val.data && !!val.data.member) {
            let queryMember = val.data.member;
          
            this.member =  {
                deposit:queryMember.deposit,
                timestamp: queryMember.timestamp,
                flow:queryMember.flow,
                amountLocked: queryMember.amountLocked,
                amountLoss: queryMember.amountLoss,
                creditsRequested : queryMember.creditsRequested,
                creditsDelegated: queryMember.creditsDelegated.map((map:any)=> map.credit)
            }

        
        let value = +this.member.flow * ( (new Date().getTime() / 1000)- +this.member.timestamp);
 

        let formated = this.global.prepareNumbers(
          +this.member.deposit + value
        );
        this.twoDec = formated.twoDec;
        this.fourDec = formated.fourDec;

          let formattedAva =  this.global.prepareNumbers(
            +this.member.deposit + value -(+this.member.amountLocked*10**12)
          );
          this.twoDecAva = formattedAva.twoDec;
          this.fourDecAva = formattedAva.fourDec;
        this.isFlowAvailable = false;
  

        if (+this.member.flow > 0) {
          this.niceFlow = (+this.member?.flow!*(30*24*3600)/(10**18)).toFixed(2)
          this.isFlowAvailable = true;
          this.destroyFormatting.next();
          let source = interval(500);
          source.pipe(takeUntil(this.destroyFormatting)).subscribe((val) => {
            const todayms = (new Date().getTime() / 1000)- +this.member.timestamp;
           
    
            let formated = this.global.prepareNumbers(
              +todayms * +this.member.flow +  +this.member.deposit
            );
            this.twoDec = formated.twoDec;
            this.fourDec = formated.fourDec;

            let formattedAva =  this.global.prepareNumbers(
              +todayms * +this.member.flow +  +this.member.deposit -(+this.member.amountLocked*10**12)
            );
            this.twoDecAva = formattedAva.twoDec;
            this.fourDecAva = formattedAva.fourDec;


          });
        } else {
          this.niceFlow = '0';
        }
        this.store.dispatch(Web3Actions.chainBusy({ status: false }));
      }
      if (val.data.member == null) {
      
        this.member = {
          deposit:'0',
          timestamp:'0',
          flow:'0',
          creditsDelegated:[],
          creditsRequested:[],
          amountLocked:'0',
          amountLoss:'0'
        }
        this.twoDec = '0.00';
        this.fourDec = '0000';
        this.store.dispatch(Web3Actions.chainBusy({ status: false }));
       }
   

    });




  }

  override async hookContractConnected(): Promise<void> {
   
    await this.getMember();
    await this.refreshBalance();
  }

  override ngOnDestroy(): void {
      this.destroyFormatting.next();
      this.destroyQueries.next()
      this.destroyFormatting.complete();
      this.destroyQueries.complete()
      super.ngOnDestroy()
  }

}
