import { Component, Input, OnChanges, Output, SimpleChanges, EventEmitter } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { DappInjector, Web3Actions } from 'angular-web3';
import { utils } from 'ethers';
import { MessageService } from 'primeng/api';
import { doSignerTransaction } from 'src/app/dapp-injector/classes/transactor';
import { createERC20Instance, createSupertokenInstance } from 'src/app/shared/helpers/helpers';
import { IPOOL_TOKEN } from 'src/app/shared/models/models';

//import { IFUND_TOKEN } from 'src/app/shared/models/pcr';


@Component({
  selector: 'user-balance',
  templateUrl: './user-balance.component.html',
  styleUrls: ['./user-balance.component.scss'],
})
export class UserBalanceComponent implements OnChanges {
  showTransferState = false;
  toUpgradeAmountCtrl = new FormControl(0, Validators.required);
  toDowngradeAmountCtrl = new FormControl(0, Validators.required);
  constructor(private msg: MessageService, private store: Store, private dapp: DappInjector) {}

  ngOnChanges(changes: SimpleChanges): void {

  }

  @Input() poolToken!: IPOOL_TOKEN;
  @Output() refreshEvent = new EventEmitter();
  @Output() public mintEvent = new EventEmitter();
  showTransfer() {
    this.showTransferState = true;
  }

  //// UPGRADE TOKENS
  async doUpgrade() {

   

    if (this.toUpgradeAmountCtrl.value <= 0) {
      this.msg.add({  key: 'tst', severity: 'warn', summary: 'Missing info', detail: `Please add amount to Upgrade` });
      return;
    }
    this.showTransferState = false;
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'Almost there, the streaming power of your supertokens', header:'Un momento'}}))
    const value = utils.parseEther(this.toUpgradeAmountCtrl.value.toString());

    const resultApprove = await doSignerTransaction(createERC20Instance(this.poolToken.token, this.dapp.signer!).approve(this.poolToken.superToken, value));
    if (resultApprove.success == true) {
    } else {
      this.store.dispatch(Web3Actions.chainBusy({ status: false }));
      this.msg.add({ key: 'tst', severity: 'error', summary: 'OOPS', detail: `Error Approving Amount with txHash:${resultApprove.txHash}` });
      return;
    }
                 
    const superToken = createSupertokenInstance(this.poolToken.superToken, this.dapp.signer!);
    const result = await doSignerTransaction(superToken.upgrade(value));

    if (result.success == true) {
      await this.refreshEvent.emit();
      this.msg.add({ key: 'tst', severity: 'success', summary: 'Great!', detail: `Upgrade Operation succesful with txHash:${result.txHash}` });
      this.store.dispatch(Web3Actions.chainBusy({ status: false }));
    } else {
      this.store.dispatch(Web3Actions.chainBusy({ status: false }));
      this.msg.add({ key: 'tst', severity: 'error', summary: 'OOPS', detail: `Error Upgrading with txHash:${result.txHash}` });
    }
   
  }

  /// DOWNGRADE TOKENS
  async doDowngrade() {
    if (this.toDowngradeAmountCtrl.value <= 0) {

      this.msg.add({ key: 'tst', severity: 'warn', summary: 'Missing info', detail: `Please add amount to Downgrade` });
   
      return;
    }
    this.showTransferState = false;
    this.store.dispatch(Web3Actions.chainBusy({ status: true }));
    this.store.dispatch(Web3Actions.chainBusyWithMessage({message: {body:'The supertokens will be "decent" erc20 in a moment', header:'Un momento'}}))
    const value = utils.parseEther(this.toDowngradeAmountCtrl.value.toString());

    const superToken = createSupertokenInstance(this.poolToken.superToken, this.dapp.signer!);

    const result = await doSignerTransaction(superToken.downgrade(value));
    if (result.success == true) {
      await this.refreshEvent.emit();
      this.store.dispatch(Web3Actions.chainBusy({ status: false }));
      this.msg.add({ key: 'tst', severity: 'success', summary: 'Great!', detail: `Downgrade Operation succesful with txHash:${result.txHash}` });
    } else {
      this.store.dispatch(Web3Actions.chainBusy({ status: false }));
      this.msg.add({ key: 'tst', severity: 'error', summary: 'OOPS', detail: `Error Downgrading with txHash:${result.txHash}` });
    }

  }
}
