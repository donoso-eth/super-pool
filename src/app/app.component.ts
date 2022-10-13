import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import { DappBaseComponent } from './dapp-injector/classes';
import { DappInjector } from './dapp-injector/dapp-injector.service';
import { PrimeNGConfig } from 'primeng/api';
import { GraphQlService } from './dapp-injector/services/graph-ql/graph-ql.service';
import { Subject, takeUntil } from 'rxjs';
import { web3Selectors } from './dapp-injector/store';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent extends DappBaseComponent implements OnInit {

  public destroyPoolHook: Subject<void> = new Subject();

  constructor(private primengConfig: PrimeNGConfig, 
    dapp: DappInjector, store: Store, 
    private graphqlService: GraphQlService, 
    private router:Router) {
    super(dapp, store);
        //////  Force Disconnect
        this.store
        .pipe(web3Selectors.hookForceDisconnect)
        .pipe(takeUntil(this.destroyHooks))
        .subscribe(() => {
         // location.reload();
          this.router.navigateByUrl('landing')
         
        });

        //     const member = this.graphqlService
        // .watchPool()
    
        // .subscribe((val: any) => {
    
        //   console.log(val)
        //   // if (!!val && !!val.data && !!val.data.member) {
        //   //   let queryMember = val.data.member;
     
        //   //      console.log(JSON.stringify(this.member))
        //   // }
        // });
  
  }
  ngOnInit() {
    this.primengConfig.ripple = true;
    document.documentElement.style.fontSize = '20px';
  }

  override ngOnDestroy(): void {
    this.destroyPoolHook.next();
    this.destroyPoolHook.complete()
    super.ngOnDestroy()
  }
}

