/* Autogenerated file. Do not edit manually. */
/* tslint:disable */
/* eslint-disable */
import {
  BaseContract,
  BigNumber,
  BigNumberish,
  BytesLike,
  CallOverrides,
  ContractTransaction,
  Overrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import { FunctionFragment, Result, EventFragment } from "@ethersproject/abi";
import { Listener, Provider } from "@ethersproject/providers";
import { TypedEventFilter, TypedEvent, TypedListener, OnEvent } from "./common";

export interface PoolStrategyV1Interface extends utils.Interface {
  functions: {
    "balanceOf()": FunctionFragment;
    "getCodeAddress()": FunctionFragment;
    "initialize(address,address,address,address,address,address)": FunctionFragment;
    "proxiableUUID()": FunctionFragment;
    "pushToStrategy(uint256)": FunctionFragment;
    "updateCode(address)": FunctionFragment;
    "withdraw(uint256,address)": FunctionFragment;
  };

  encodeFunctionData(functionFragment: "balanceOf", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "getCodeAddress",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "initialize",
    values: [string, string, string, string, string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "proxiableUUID",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "pushToStrategy",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "updateCode", values: [string]): string;
  encodeFunctionData(
    functionFragment: "withdraw",
    values: [BigNumberish, string]
  ): string;

  decodeFunctionResult(functionFragment: "balanceOf", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "getCodeAddress",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "proxiableUUID",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "pushToStrategy",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "updateCode", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "withdraw", data: BytesLike): Result;

  events: {
    "CodeUpdated(bytes32,address)": EventFragment;
    "Initialized(uint8)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "CodeUpdated"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "Initialized"): EventFragment;
}

export type CodeUpdatedEvent = TypedEvent<
  [string, string],
  { uuid: string; codeAddress: string }
>;

export type CodeUpdatedEventFilter = TypedEventFilter<CodeUpdatedEvent>;

export type InitializedEvent = TypedEvent<[number], { version: number }>;

export type InitializedEventFilter = TypedEventFilter<InitializedEvent>;

export interface PoolStrategyV1 extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: PoolStrategyV1Interface;

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
    balanceOf(
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { balance: BigNumber }>;

    getCodeAddress(
      overrides?: CallOverrides
    ): Promise<[string] & { codeAddress: string }>;

    initialize(
      _superToken: string,
      _token: string,
      _pool: string,
      _aavePool: string,
      _aToken: string,
      _aaveToken: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    proxiableUUID(overrides?: CallOverrides): Promise<[string]>;

    pushToStrategy(
      amountToDeposit: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    updateCode(
      newAddress: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    withdraw(
      amount: BigNumberish,
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;
  };

  balanceOf(overrides?: CallOverrides): Promise<BigNumber>;

  getCodeAddress(overrides?: CallOverrides): Promise<string>;

  initialize(
    _superToken: string,
    _token: string,
    _pool: string,
    _aavePool: string,
    _aToken: string,
    _aaveToken: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  proxiableUUID(overrides?: CallOverrides): Promise<string>;

  pushToStrategy(
    amountToDeposit: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  updateCode(
    newAddress: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  withdraw(
    amount: BigNumberish,
    _supplier: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    balanceOf(overrides?: CallOverrides): Promise<BigNumber>;

    getCodeAddress(overrides?: CallOverrides): Promise<string>;

    initialize(
      _superToken: string,
      _token: string,
      _pool: string,
      _aavePool: string,
      _aToken: string,
      _aaveToken: string,
      overrides?: CallOverrides
    ): Promise<void>;

    proxiableUUID(overrides?: CallOverrides): Promise<string>;

    pushToStrategy(
      amountToDeposit: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    updateCode(newAddress: string, overrides?: CallOverrides): Promise<void>;

    withdraw(
      amount: BigNumberish,
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {
    "CodeUpdated(bytes32,address)"(
      uuid?: null,
      codeAddress?: null
    ): CodeUpdatedEventFilter;
    CodeUpdated(uuid?: null, codeAddress?: null): CodeUpdatedEventFilter;

    "Initialized(uint8)"(version?: null): InitializedEventFilter;
    Initialized(version?: null): InitializedEventFilter;
  };

  estimateGas: {
    balanceOf(overrides?: CallOverrides): Promise<BigNumber>;

    getCodeAddress(overrides?: CallOverrides): Promise<BigNumber>;

    initialize(
      _superToken: string,
      _token: string,
      _pool: string,
      _aavePool: string,
      _aToken: string,
      _aaveToken: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    proxiableUUID(overrides?: CallOverrides): Promise<BigNumber>;

    pushToStrategy(
      amountToDeposit: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    updateCode(
      newAddress: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    withdraw(
      amount: BigNumberish,
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    balanceOf(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getCodeAddress(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    initialize(
      _superToken: string,
      _token: string,
      _pool: string,
      _aavePool: string,
      _aToken: string,
      _aaveToken: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    proxiableUUID(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    pushToStrategy(
      amountToDeposit: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    updateCode(
      newAddress: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    withdraw(
      amount: BigNumberish,
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;
  };
}
