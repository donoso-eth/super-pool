import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { RedeemFlowRoutingModule } from './redeem-flow-routing.module';
import { RedeemFlowComponent } from './redeem-flow.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';


@NgModule({
  declarations: [
    RedeemFlowComponent
  ],
  imports: [
    CommonModule,
    RedeemFlowRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    InputNumberModule,
    InputTextModule,
    DropdownModule,
    DialogModule,
    InputNumberModule
  ]
})
export class RedeemFlowModule { }
