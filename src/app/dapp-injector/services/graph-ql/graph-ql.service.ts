import { Injectable } from '@angular/core';
import { Apollo, QueryRef, gql } from 'apollo-angular';
import { Subscription } from 'rxjs';
import { GET_POOL, GET_SUPPLIER } from './queryPool';



@Injectable({
  providedIn: 'root',
})
export class GraphQlService {
  loading!: boolean;
  posts: any;

  private querySubscription!: Subscription;
  constructor(private apollo: Apollo) {}
  
  
  watchSupplier(address: string) {
    const variables = { address: address.toLowerCase() };
    return this.apollo.watchQuery<any>({
      query: gql(GET_SUPPLIER),
      variables,
      pollInterval: 500,
    }).valueChanges;
  }

  watchPool() {
    return this.apollo
      .watchQuery<any>({
        query: gql(GET_POOL),
      pollInterval: 500,
      })
      .valueChanges
  }
  
}
