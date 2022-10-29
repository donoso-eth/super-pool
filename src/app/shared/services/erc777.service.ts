import { Injectable } from '@angular/core';
import { DappInjector } from 'angular-web3';
import { BigNumberish, constants, Contract, ethers, Signer, utils } from 'ethers';
import { doSignerTransaction } from 'src/app/dapp-injector/classes/transactor';
import {
  createERC20Instance,
  createERC777Instance,
  createSupertokenInstance,
} from '../helpers/helpers';

import { IPOOL_TOKEN } from '../models/models';
import { GlobalService } from './global.service';
import { IERC777 } from 'src/assets/contracts/interfaces/IERC777';

@Injectable({
  providedIn: 'root',
})
export class ERC777Service {
  erc777?: IERC777;

  constructor(public dapp: DappInjector, public global: GlobalService) {}

  getTokenInstance() {
    console.log(this.global.poolToken.superToken)

    if (this.erc777 == undefined) {
      this.erc777 = createERC777Instance(
        this.global.poolToken.superToken,
        this.dapp.signer!
      ) as IERC777;
    }
  }

 async depositIntoPool(amount:BigNumberish) {
  console.log(amount);
  await this.getTokenInstance();

 let result =  await  doSignerTransaction (this.erc777?.send(this.dapp.defaultContract?.address!,amount,"0x")!)
  return result
  }
}
