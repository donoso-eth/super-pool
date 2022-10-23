import { Component, OnDestroy, OnInit } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { DappBaseComponent, DappInjector, Web3Actions } from 'angular-web3';
import { utils } from 'ethers';
import { MessageService } from 'primeng/api';
import { interval, takeUntil, async, Subject } from 'rxjs';
import { doSignerTransaction } from 'src/app/dapp-injector/classes/transactor';
import { GraphQlService } from 'src/app/dapp-injector/services/graph-ql/graph-ql.service';

import { SuperFluidService } from 'src/app/dapp-injector/services/super-fluid/super-fluid-service.service';
import { IPOOL_STATE, IPOOL_TOKEN } from 'src/app/shared/models/models';
import { ISUPPLIER_QUERY } from 'src/app/shared/models/pool_models';
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
  twoDec: string = '00';
  fourDec: string = '0000';
  twoDecAva: string = '00';
  fourDecAva: string = '0000';
  isFlowAvailable = false;
  isOutFlowAvailable = false;

  destroyQueries: Subject<void> = new Subject();
  destroyFormatting: Subject<void> = new Subject();

  depositAmountCtrl = new FormControl('', [Validators.required, Validators.min(1)]);

  supplier!: ISUPPLIER_QUERY;

  memberDisplay: any;
  niceFlow!: string;
  niceOutFlow!: string;

  constructor(
    store: Store,
    dapp: DappInjector,
    public router: Router,
    public formBuilder: FormBuilder,
    public global: GlobalService,
    private graphqlService: GraphQlService,
    public erc777: ERC777Service,
    public msg: MessageService,
    public superFluidService: SuperFluidService
  ) {
    super(dapp, store);
  }

  showRedeemFlow() {
    this.router.navigateByUrl('redeem-flow');
  }

  async stopRedeemFlow() {
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({ message: { body: 'stopping your Receiving flow', header: 'Un momento' } }));
 
    await (doSignerTransaction(this.dapp.defaultContract?.instance.redeemFlowStop({gasLimit:2000000})!))

  }

  showStartFlow() {
    this.router.navigateByUrl('start-flow');
  }

  async stopFlow() {
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({ message: { body: 'stopping your flow', header: 'Un momento' } }));
    await this.superFluidService.stopStream({
      receiver: this.dapp.defaultContract?.address!,
      superToken: this.global.poolToken.superToken,

      data: '0x',
    });
  }

  async wrapp() {}

  async mint() {
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({ message: { body: 'Minting your tokens', header: 'Un momento' } }));
    await this.global.mint();
    this.store.dispatch(Web3Actions.chainBusyWithMessage({ message: { body: 'Querying your balances', header: 'Un momento' } }));
    await this.refreshBalance();
    this.store.dispatch(Web3Actions.chainBusy({ status: false }));
  }

  async withdraw() {
  
    let amount = utils.parseEther(this.depositAmountCtrl.value.toString());


    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({ message: { body: 'it is ok to need the money....', header: 'Un momento' } }));
     await doSignerTransaction(this.dapp.defaultContract?.instance?.redeemDeposit(amount,{gasLimit:2000000})!)
    
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
    this.store.dispatch(Web3Actions.chainBusyWithMessage({ message: { body: 'Yes, yes your deposit is on the way', header: 'Un momento' } }));
    await this.erc777.depositIntoPool(amount);

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
    this.store.dispatch(Web3Actions.chainBusyWithMessage({ message: { header: 'A momnet...', body: 'we are fetching last data for you' } }));
    if (this.blockchain_status == 'wallet-connected') {
      // this.getMember()
    }
  }

  requestCredit() {
    this.router.navigateByUrl('request-credit');
  }

  async getMember() {
    this.destroyQueries.next();
    this.graphqlService
      .watchSupplier(this.dapp.signerAddress!)
      .pipe(takeUntil(this.destroyQueries))
      .subscribe(async (val: any) => {
        console.log(val);

        if (!!val && !!val.data && !!val.data.suppliers && val.data.suppliers.length > 0) {


          let realbalance = await this.dapp.DAPP_STATE.defaultContract?.instance.balanceOf(this.dapp.signerAddress!);

  

       let nowTiem = new Date().getTime();

          let querySupplier = val.data.suppliers[0];

          this.supplier = querySupplier;
       

          let value = +this.supplier.inFlow * (new Date().getTime() - nowTiem)/1000;

          let formated = this.global.prepareNumbers(+realbalance! + value);
          this.twoDec = formated.twoDec;
          this.fourDec = formated.fourDec;
    

          this.isFlowAvailable = false;

          if (+this.supplier.inFlow > 0 || +this.supplier.outFlow >0) {
        

            if (+this.supplier.inFlow >0){
            this.niceFlow = ((+this.supplier?.inFlow! * (30 * 24 * 3600)) / 10 ** 18).toFixed(2);
            this.niceOutFlow = "0.00";
          }
            if (+this.supplier.outFlow >0){
            this.niceOutFlow = ((+this.supplier?.outFlow! * (30 * 24 * 3600)) / 10 ** 18).toFixed(2);
            this.niceFlow = "0.00";
           }
            this.isFlowAvailable =  +this.supplier.inFlow > 0 ? true : false;
            this.isOutFlowAvailable =  +this.supplier.outFlow > 0 ? true : false;
            this.destroyFormatting.next();
            let source = interval(500);

            source.pipe(takeUntil(this.destroyFormatting)).subscribe((val) => {
              const todayms = (new Date().getTime()  - nowTiem)/1000;
              let formated;
              if (+this.supplier.outFlow >0){
                formated = this.global.prepareNumbers(+realbalance! - (+todayms * +this.supplier.outFlow) );
          
               } else {
                formated = this.global.prepareNumbers(+todayms * +this.supplier.inFlow + +realbalance!);
          
              }
              this.twoDec = formated.twoDec;
              this.fourDec = formated.fourDec;

         
            });
          } else {
            this.niceFlow = '0.00';
            this.niceOutFlow = '0.00';
       
          }
          this.store.dispatch(Web3Actions.chainBusy({ status: false }));
        }
        if (val.data.suppliers == null ||val.data.suppliers.length == 0 ) {
 
          this.supplier = {
       
            id: '0',
            supplier: '0',
            timestamp: '0',
            createdTimestamp: '0',

            deposit: '0',

            cumulatedYield: '0',

            inFlow: '0',
            inCancelFlowId: '0',

            outFlow: '0',
            outCancelFlowId: '0',
            outStepAmount: '0',
            outStepTime: '0',
            outInitTime: '0',
            outMinBalance: '0',
            outCancelWithdrawId: '0',

            apySpan: '0',
            apy: '0',
          };
          this.twoDec = '0.00';
          this.fourDec = '0000';
          this.niceFlow = '0.00';
          this.niceOutFlow = '0.00';
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
    this.destroyQueries.next();
    this.destroyFormatting.complete();
    this.destroyQueries.complete();
    super.ngOnDestroy();
  }
}
