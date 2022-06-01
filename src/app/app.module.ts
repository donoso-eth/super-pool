import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { SuperPoolModule } from './0-minimal-contract/minimal-contract.module';
import { DappInjectorModule } from './dapp-injector/dapp-injector.module';
import { StoreModule } from '@ngrx/store';
import { we3ReducerFunction } from 'angular-web3';

@NgModule({
  declarations: [
    AppComponent
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    SuperPoolModule,
    DappInjectorModule.forRoot({wallet:'local', defaultNetwork:'localhost'}),
    StoreModule.forRoot({web3: we3ReducerFunction}),
  ],
  providers: [],
  bootstrap: [AppComponent]
})
export class AppModule { }
