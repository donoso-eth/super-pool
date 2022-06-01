import { NgModule,InjectionToken } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SuperPoolComponent } from './minimal-contract/minimal-contract.component';

import { ICONTRACT_METADATA } from 'angular-web3';

import SuperPoolMetadata from '../../assets/contracts/super_pool_metadata.json';
export const contractMetadata = new InjectionToken<ICONTRACT_METADATA>('contractMetadata')

export const contractProvider= {provide: 'contractMetadata', useValue:SuperPoolMetadata };



@NgModule({
  declarations: [
    SuperPoolComponent
  ],
  imports: [
    CommonModule,
  ],
  exports: [
    SuperPoolComponent,
  ],
  providers:[ contractProvider]
})
export class SuperPoolModule { }
