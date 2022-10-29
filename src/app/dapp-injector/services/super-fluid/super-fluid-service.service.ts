import { Injectable } from '@angular/core';
import { Framework, SuperToken, ConstantFlowAgreementV1, InstantDistributionAgreementV1, Host } from '@superfluid-finance/sdk-core';
import Operation from '@superfluid-finance/sdk-core/dist/module/Operation';
import { ethers, Signer, utils } from 'ethers';
import { settings } from '../../constants';
import { DappInjector } from '../../dapp-injector.service';

@Injectable({
  providedIn: 'root',
})
export class SuperFluidService {
  sf!: Framework;
  flow!: ConstantFlowAgreementV1;
  operations: Array<Operation> = [];
  constructor(private dapp: DappInjector) {}

  async getContracts() {}

  async initializeFramework() {
    console.log(20,this.dapp.dappConfig.defaultNetwork);
    this.sf = await Framework.create({
      chainId:settings[this.dapp.dappConfig.defaultNetwork!].chainId,
      provider: this.dapp.DAPP_STATE.defaultProvider!,
      customSubgraphQueriesEndpoint: settings[this.dapp.dappConfig.defaultNetwork].subgraph,
      resolverAddress: settings[this.dapp.dappConfig.defaultNetwork].resolver,
    });

    this.flow = this.sf.cfaV1;
  }

  ///// ---------  ---------  Money Streaming ---------  ---------  ////
  // #region Money Streaming
  async startStream(streamConfig: { flowRate: string; receiver: string; superToken: string; data: string }) {
    if (this.sf == undefined) {
      await this.initializeFramework();
    }

    let createFlowOperation = this.sf.cfaV1.createFlow({
      receiver: this.dapp.defaultContract?.address!,
      flowRate: streamConfig.flowRate,
      superToken:streamConfig.superToken,
    });
    await createFlowOperation.exec(this.dapp.signer!);
  
  }

  async createStream(streamConfig: { flowRate: string; receiver: string; superToken: string; data: string }) {
    if (this.sf == undefined) {
      await this.initializeFramework();
    }

    const createFlowOperation = this.flow.createFlow({
      flowRate: streamConfig.flowRate,
      receiver: streamConfig.receiver,
      superToken: streamConfig.superToken, //  '0x5D8B4C2554aeB7e86F387B4d6c00Ac33499Ed01f', //environment.mumbaiDAIx,
      userData: streamConfig.data,
      overrides: {
        gasPrice: utils.parseUnits('100', 'gwei'),
        gasLimit: 2000000,
      },
    });

    this.operations.push(createFlowOperation);
  }

  async stopStream(streamConfig: { receiver: string; superToken: string; data: string }) {
    if (this.sf == undefined) {
      await this.initializeFramework();
    }

    const deleteFlowOperation = this.sf.cfaV1.deleteFlow({
      sender: this.dapp.signerAddress!,
      receiver: streamConfig.receiver,
      superToken: streamConfig.superToken, //environment.mumbaiDAIx,
      userData: streamConfig.data,
      overrides: {
        gasPrice: utils.parseUnits('100', 'gwei'),
        gasLimit: 2000000,
      },
    });
    const result = await deleteFlowOperation.exec(this.dapp.DAPP_STATE.signer!);
    const result2 = await result.wait();
  }

  calculateFlowRate(amount: any) {
    if (typeof Number(amount) !== 'number' || isNaN(Number(amount)) === true) {
      alert('You can only calculate a flowRate based on a number');
      return;
    } else if (typeof Number(amount) === 'number') {
      if (Number(amount) === 0) {
        return 0;
      }
      const amountInWei = ethers.BigNumber.from(amount);
      const monthlyAmount = ethers.utils.formatEther(amountInWei.toString());
      const calculatedFlowRate = +monthlyAmount * 3600 * 24 * 30;
      return calculatedFlowRate;
    }
    return;
  }

  //// VIEW READ FUNCITONS
  async getFlow(options: { sender: string; receiver: string; superToken: string }) {
    if (this.sf == undefined) {
      await this.initializeFramework();
    }

    const result = await this.flow.getFlow({
      superToken: options.superToken,
      sender: options.sender,
      receiver: options.receiver,
      providerOrSigner: this.dapp.signer!,
    });
    return result;
  }

  // async getAccountFlowInfo(){
  //   await this.flow.getAccountFlowInfo({
  //     superToken: string,
  //     account: string,
  //     providerOrSigner: ethers.providers.Provider | ethers.Signer
  //   });
  // }

  // async getNetFlow(){
  //   await this.flow.getNetFlow({
  //     superToken: string,
  //     account: string,
  //     providerOrSigner: Signer
  //   });
  //}

  // #endregion Money Streaming


  async isSuperToken() {
    const p = this.sf.loadSuperToken('sda');
  }
}
