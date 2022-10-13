import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';
import { StartFlowComponent } from './start-flow.component';

const routes: Routes = [{ path: '', component: StartFlowComponent }];

@NgModule({
  imports: [RouterModule.forChild(routes)],
  exports: [RouterModule]
})
export class StartFlowRoutingModule { }
