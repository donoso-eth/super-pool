import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { StartFlowRoutingModule } from './start-flow-routing.module';
import { StartFlowComponent } from './start-flow.component';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { ButtonModule } from 'primeng/button';
import { DialogModule } from 'primeng/dialog';
import { DropdownModule } from 'primeng/dropdown';
import { InputNumberModule } from 'primeng/inputnumber';
import { InputTextModule } from 'primeng/inputtext';


@NgModule({
  declarations: [
    StartFlowComponent
  ],
  imports: [
    CommonModule,
    StartFlowRoutingModule,
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
export class StartFlowModule { }
