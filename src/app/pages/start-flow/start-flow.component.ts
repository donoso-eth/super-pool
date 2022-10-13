import { Component, OnInit } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { DappBaseComponent, DappInjector, Web3Actions } from 'angular-web3';
import { utils } from 'ethers';
import { MessageService } from 'primeng/api';
import { SuperFluidService } from 'src/app/dapp-injector/services/super-fluid/super-fluid-service.service';
import { GlobalService } from 'src/app/shared/services/global.service';

@Component({
  selector: 'app-start-flow',
  templateUrl: './start-flow.component.html',
  styleUrls: ['./start-flow.component.scss']
})
export class StartFlowComponent  extends DappBaseComponent implements OnInit {
  stopCondition = [
    { condition: 'No stop',  id: 0 },
    { condition: 'Stop after time',  id: 1 },
    { condition: 'Stop after amount',  id: 2 },
  ];

  perDurations = [
    { name: 'per hour', id: 1, factor: 3600 },
    { name: 'per day', id: 2, factor: 86400 },
    { name: 'per month', id: 3, factor: 2592000 },
  ];

  durations = [
    { name: 'hours', id: 1, factor: 3600 },
    { name: 'days', id: 2, factor: 86400 },
    { name: 'months', id: 3, factor: 2592000 },
  ];
  startStreamForm: any;
  constructor( 
     store: Store, dapp: DappInjector,
    public superfluid: SuperFluidService,
    public formBuilder: FormBuilder, public router:Router,
    public global: GlobalService, public msg:MessageService) { 
      super(dapp,store)
    this.startStreamForm = this.formBuilder.group({

      flowRateAmountCtrl: [10, [Validators.required, Validators.min(1)]],
      flowRateTimeCtrl: [
        { name: 'per month', id: 3, factor: 2592000 },
        [Validators.required],
      ],
      flowRateConditionCtrl: [
        { condition: 'No stop',  id: 0 },
        [Validators.required],
      ],
      
      stopDurationCtrl: [
        { name: 'hours', id: 1, factor: 3600 },
        [Validators.required],
      ],
      stopAmountDurationCtrl: [10, [Validators.required, Validators.min(1)]],
   
      stopAmountCtrl: [10, [Validators.required, Validators.min(5)]],
    });

  }

  back(){
    this.router.navigateByUrl('dashboard')
  }

  changeCondition(value:any){
    let id = value.value.id;
    if (id == 0){
      this.startStreamForm.controls.stopDurationCtrl.clearValidators();
      this.startStreamForm.controls.stopAmountDurationCtrl.clearValidators()
      this.startStreamForm.controls.stopAmountCtr.clearValidators();
      } else if (id == 1){
        this.startStreamForm.controls.stopDurationCtrl.setValidators( [Validators.required]);
        this.startStreamForm.controls.stopAmountDurationCtrl.setValidators([Validators.required, Validators.min(1)])
        this.startStreamForm.controls.stopAmountCtrl.clearValidators();
    } else if (id == 2) {
      this.startStreamForm.controls.stopDurationCtrl.clearValidators();
      this.startStreamForm.controls.stopAmountDurationCtrl.clearValidators()
      this.startStreamForm.controls.stopAmountCtrl.setValidators([Validators.required, Validators.min(5)])
    }
  }

 async  startFlow() {
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'Yeap... the stream is going to come', header:'Un momento'}}))
    
    let amount = this.startStreamForm.controls.flowRateAmountCtrl.value;
    
    let flowRate = ((amount *  10 ** 18) / this.startStreamForm.controls.flowRateTimeCtrl.value.factor).toFixed(0); // 10 tokens per day
   

  
    const config: {
      flowRate: string;
      receiver: string;
      superToken: string;
      data: string;
    } = {
      flowRate,
      receiver: this.dapp.defaultContract?.address!,
      superToken: this.global.poolToken.superToken,
      data:"0x"
    };

  
    if ( this. startStreamForm.controls.flowRateConditionCtrl.value.id == 1) {

    let  duration = ((this.startStreamForm.controls.stopDurationCtrl.value.factor * this.startStreamForm.controls.stopAmountDurationCtrl.value * 10 ** 18)/ +flowRate).toFixed(0);;

    let data = utils.defaultAbiCoder.encode(
      ['uint256'],
      [duration]
    );
      config.data = data;

    } else if (this. startStreamForm.controls.flowRateConditionCtrl.value.id == 2) {
     
      let  duration = ((this.startStreamForm.controls.stopAmountCtrl.value * 10 ** 18)/ +flowRate).toFixed(0);

      let data = utils.defaultAbiCoder.encode(
        ['uint256'],
        [duration]
      );
        config.data = data;
    }

    await this.superfluid.startStream(config);
    this.store.dispatch(Web3Actions.chainBusy({ status: false}));
    this.back()

  }

  ngOnInit(): void {
  }

}
