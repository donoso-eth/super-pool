import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { DashboardRoutingModule } from './dashboard-routing.module';
import { DashboardComponent } from './dashboard.component';
import { ButtonModule } from 'primeng/button';
import { UserBalanceModule } from 'src/app/shared/components/user-balance/user-balance.module';
import { DialogModule } from 'primeng/dialog';
import { InputNumberModule } from 'primeng/inputnumber';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { DropdownModule } from 'primeng/dropdown';
import { InputTextModule } from 'primeng/inputtext';
import { TabViewModule } from 'primeng/tabview';
import { LensProfileModule } from 'src/app/shared/components/lens-profile/lens-profile.module';
import { CreditTableModule } from 'src/app/shared/components/credit-table/credit-table.module';
import { ProgressSpinnerModule } from 'primeng/progressspinner';

@NgModule({
  declarations: [
    DashboardComponent
  ],
  imports: [
    CommonModule,
    DashboardRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    ButtonModule,
    UserBalanceModule,
    InputNumberModule,
    InputTextModule,
    DropdownModule,
    DialogModule,
    ProgressSpinnerModule,
    InputNumberModule,
    TabViewModule,
    LensProfileModule,
    CreditTableModule
  ]
})
export class DashboardModule { }
