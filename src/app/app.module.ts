import { NgModule } from '@angular/core';
import { BrowserModule } from '@angular/platform-browser';

import { AppRoutingModule } from './app-routing.module';
import { AppComponent } from './app.component';
import { DappInjectorModule } from './dapp-injector/dapp-injector.module';
import { StoreModule } from '@ngrx/store';
import { settings, we3ReducerFunction } from 'angular-web3';
import { ButtonModule } from 'primeng/button';

import { LoadingComponent } from './shared/components/loading/loading.component';
import { ToastModule } from 'primeng/toast';
import { DropdownModule } from 'primeng/dropdown';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { SuperFluidServiceModule } from './dapp-injector/services/super-fluid/super-fluid-service.module';
import { ClipboardModule } from '@angular/cdk/clipboard';
import { AppFooterComponent } from './shared/components/footer/app.footer.component';
import { AppTopBarComponent } from './shared/components/toolbar/app.topbar.component';
import { MessageService } from 'primeng/api';
import { ERC777Service } from './shared/services/erc777.service';
import { GlobalService } from './shared/services/global.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { GraphQlModule } from './dapp-injector/services/graph-ql/graph-ql.module';
import { HttpClientModule } from '@angular/common/http';

import { BrowserAnimationsModule } from '@angular/platform-browser/animations';
const network = 'localhost';

@NgModule({
  declarations: [
    AppComponent,
    LoadingComponent,

    AppTopBarComponent,
    AppFooterComponent
  ],

  imports: [
    BrowserModule,
    BrowserAnimationsModule,
    AppRoutingModule,
    HttpClientModule,
    FormsModule,
    ReactiveFormsModule,
    DappInjectorModule.forRoot({wallet: settings[network].wallet, defaultNetwork:network}),
    GraphQlModule.forRoot({uri: settings[network].graphUri}),
    StoreModule.forRoot({web3: we3ReducerFunction}),
    DropdownModule,
    ProgressSpinnerModule,
    ToastModule,
    ButtonModule,
    SuperFluidServiceModule,
    ClipboardModule
  ],
  providers: [MessageService,GlobalService,ERC777Service],
  bootstrap: [AppComponent]
})
export class AppModule { }
