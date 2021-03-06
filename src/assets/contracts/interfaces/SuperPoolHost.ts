/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  BaseContract,
  BigNumber,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import { FunctionFragment, Result } from "@ethersproject/abi";
import { Listener, Provider } from "@ethersproject/providers";
import { TypedEventFilter, TypedEvent, TypedListener, OnEvent } from "./common";

export type SuperPoolInputStruct = {
  poolFactory: string;
  superToken: string;
  ops: string;
};

export type SuperPoolInputStructOutput = [string, string, string] & {
  poolFactory: string;
  superToken: string;
  ops: string;
};

export interface SuperPoolHostInterface extends utils.Interface {
  functions: {
    "_pcrTokensIssued()": FunctionFragment;
    "createSuperPool((address,address,address))": FunctionFragment;
    "poolAdressBySuperToken(address)": FunctionFragment;
  };

  encodeFunctionData(
    functionFragment: "_pcrTokensIssued",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "createSuperPool",
    values: [SuperPoolInputStruct]
  ): string;
  encodeFunctionData(
    functionFragment: "poolAdressBySuperToken",
    values: [string]
  ): string;

  decodeFunctionResult(
    functionFragment: "_pcrTokensIssued",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "createSuperPool",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "poolAdressBySuperToken",
    data: BytesLike
  ): Result;

  events: {};
}

export interface SuperPoolHost extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: SuperPoolHostInterface;

  queryFilter<TEvent extends TypedEvent>(
    event: TypedEventFilter<TEvent>,
    fromBlockOrBlockhash?: string | number | undefined,
    toBlock?: string | number | undefined
  ): Promise<Array<TEvent>>;

  listeners<TEvent extends TypedEvent>(
    eventFilter?: TypedEventFilter<TEvent>
  ): Array<TypedListener<TEvent>>;
  listeners(eventName?: string): Array<Listener>;
  removeAllListeners<TEvent extends TypedEvent>(
    eventFilter: TypedEventFilter<TEvent>
  ): this;
  removeAllListeners(eventName?: string): this;
  off: OnEvent<this>;
  on: OnEvent<this>;
  once: OnEvent<this>;
  removeListener: OnEvent<this>;

  functions: {
    _pcrTokensIssued(
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { _value: BigNumber }>;

    createSuperPool(
      superPoolInput: SuperPoolInputStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    poolAdressBySuperToken(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<[string]>;
  };

  _pcrTokensIssued(overrides?: CallOverrides): Promise<BigNumber>;

  createSuperPool(
    superPoolInput: SuperPoolInputStruct,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  poolAdressBySuperToken(
    arg0: string,
    overrides?: CallOverrides
  ): Promise<string>;

  callStatic: {
    _pcrTokensIssued(overrides?: CallOverrides): Promise<BigNumber>;

    createSuperPool(
      superPoolInput: SuperPoolInputStruct,
      overrides?: CallOverrides
    ): Promise<void>;

    poolAdressBySuperToken(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<string>;
  };

  filters: {};

  estimateGas: {
    _pcrTokensIssued(overrides?: CallOverrides): Promise<BigNumber>;

    createSuperPool(
      superPoolInput: SuperPoolInputStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    poolAdressBySuperToken(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    _pcrTokensIssued(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    createSuperPool(
      superPoolInput: SuperPoolInputStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    poolAdressBySuperToken(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;
  };
}
