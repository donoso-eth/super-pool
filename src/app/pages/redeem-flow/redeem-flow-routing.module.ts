import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { RedeemFlowComponent } from './redeem-flow.component';

const routes: Routes = [{ path: '', component: RedeemFlowComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class RedeemFlowRoutingModule { }
