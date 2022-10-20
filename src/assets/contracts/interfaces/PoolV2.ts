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
  PayableOverrides,
  PopulatedTransaction,
  Signer,
  utils,
} from "ethers";
import { FunctionFragment, Result, EventFragment } from "@ethersproject/abi";
import { Listener, Provider } from "@ethersproject/providers";
import { TypedEventFilter, TypedEvent, TypedListener, OnEvent } from "./common";

export type APYStruct = { span: BigNumberish; apy: BigNumberish };

export type APYStructOutput = [BigNumber, BigNumber] & {
  span: BigNumber;
  apy: BigNumber;
};

export type PoolV2Struct = {
  id: BigNumberish;
  timestamp: BigNumberish;
  nrSuppliers: BigNumberish;
  deposit: BigNumberish;
  depositFromInFlowRate: BigNumberish;
  inFlowRate: BigNumberish;
  outFlowRate: BigNumberish;
  outFlowBuffer: BigNumberish;
  yieldTokenIndex: BigNumberish;
  yieldInFlowRateIndex: BigNumberish;
  yieldAccrued: BigNumberish;
  yieldSnapshot: BigNumberish;
  totalYield: BigNumberish;
  apy: APYStruct;
};

export type PoolV2StructOutput = [
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  APYStructOutput
] & {
  id: BigNumber;
  timestamp: BigNumber;
  nrSuppliers: BigNumber;
  deposit: BigNumber;
  depositFromInFlowRate: BigNumber;
  inFlowRate: BigNumber;
  outFlowRate: BigNumber;
  outFlowBuffer: BigNumber;
  yieldTokenIndex: BigNumber;
  yieldInFlowRateIndex: BigNumber;
  yieldAccrued: BigNumber;
  yieldSnapshot: BigNumber;
  totalYield: BigNumber;
  apy: APYStructOutput;
};

export interface PoolV2Interface extends utils.Interface {
  functions: {
    "ETH()": FunctionFragment;
    "afterAgreementCreated(address,address,bytes32,bytes,bytes,bytes)": FunctionFragment;
    "afterAgreementTerminated(address,address,bytes32,bytes,bytes,bytes)": FunctionFragment;
    "afterAgreementUpdated(address,address,bytes32,bytes,bytes,bytes)": FunctionFragment;
    "beforeAgreementCreated(address,address,bytes32,bytes,bytes)": FunctionFragment;
    "beforeAgreementTerminated(address,address,bytes32,bytes,bytes)": FunctionFragment;
    "beforeAgreementUpdated(address,address,bytes32,bytes,bytes)": FunctionFragment;
    "cfa()": FunctionFragment;
    "closeAccount()": FunctionFragment;
    "gelato()": FunctionFragment;
    "getLastPool()": FunctionFragment;
    "getPool(uint256)": FunctionFragment;
    "host()": FunctionFragment;
    "initialize(address,address,address,address)": FunctionFragment;
    "initializeAfterSettings(address)": FunctionFragment;
    "lastPoolTimestamp()": FunctionFragment;
    "ops()": FunctionFragment;
    "proxiableUUID()": FunctionFragment;
    "redeemDeposit(uint256)": FunctionFragment;
    "redeemFlow(int96)": FunctionFragment;
    "redeemFlowStop()": FunctionFragment;
    "sfCreateFlow(address,int96)": FunctionFragment;
    "sfDeleteFlow(address,address)": FunctionFragment;
    "sfDeleteFlowWithCtx(bytes,address,address)": FunctionFragment;
    "sfUpdateFlow(address,int96)": FunctionFragment;
    "tokensReceived(address,address,address,uint256,bytes,bytes)": FunctionFragment;
    "transfer(uint256,address)": FunctionFragment;
    "transferSuperToken(address,uint256)": FunctionFragment;
    "upgradeTo(address)": FunctionFragment;
    "upgradeToAndCall(address,bytes)": FunctionFragment;
    "withdraw()": FunctionFragment;
  };

  encodeFunctionData(functionFragment: "ETH", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "afterAgreementCreated",
    values: [string, string, BytesLike, BytesLike, BytesLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "afterAgreementTerminated",
    values: [string, string, BytesLike, BytesLike, BytesLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "afterAgreementUpdated",
    values: [string, string, BytesLike, BytesLike, BytesLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "beforeAgreementCreated",
    values: [string, string, BytesLike, BytesLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "beforeAgreementTerminated",
    values: [string, string, BytesLike, BytesLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "beforeAgreementUpdated",
    values: [string, string, BytesLike, BytesLike, BytesLike]
  ): string;
  encodeFunctionData(functionFragment: "cfa", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "closeAccount",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "gelato", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "getLastPool",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "getPool",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "host", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "initialize",
    values: [string, string, string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "initializeAfterSettings",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "lastPoolTimestamp",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "ops", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "proxiableUUID",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "redeemDeposit",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "redeemFlow",
    values: [BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "redeemFlowStop",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "sfCreateFlow",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "sfDeleteFlow",
    values: [string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "sfDeleteFlowWithCtx",
    values: [BytesLike, string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "sfUpdateFlow",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "tokensReceived",
    values: [string, string, string, BigNumberish, BytesLike, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "transfer",
    values: [BigNumberish, string]
  ): string;
  encodeFunctionData(
    functionFragment: "transferSuperToken",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(functionFragment: "upgradeTo", values: [string]): string;
  encodeFunctionData(
    functionFragment: "upgradeToAndCall",
    values: [string, BytesLike]
  ): string;
  encodeFunctionData(functionFragment: "withdraw", values?: undefined): string;

  decodeFunctionResult(functionFragment: "ETH", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "afterAgreementCreated",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "afterAgreementTerminated",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "afterAgreementUpdated",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "beforeAgreementCreated",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "beforeAgreementTerminated",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "beforeAgreementUpdated",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "cfa", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "closeAccount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "gelato", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "getLastPool",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "getPool", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "host", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "initialize", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "initializeAfterSettings",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "lastPoolTimestamp",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "ops", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "proxiableUUID",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "redeemDeposit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "redeemFlow", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "redeemFlowStop",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "sfCreateFlow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "sfDeleteFlow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "sfDeleteFlowWithCtx",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "sfUpdateFlow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "tokensReceived",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "transfer", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "transferSuperToken",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "upgradeTo", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "upgradeToAndCall",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "withdraw", data: BytesLike): Result;

  events: {
    "AdminChanged(address,address)": EventFragment;
    "BeaconUpgraded(address)": EventFragment;
    "Initialized(uint8)": EventFragment;
    "Upgraded(address)": EventFragment;
  };

  getEvent(nameOrSignatureOrTopic: "AdminChanged"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "BeaconUpgraded"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "Initialized"): EventFragment;
  getEvent(nameOrSignatureOrTopic: "Upgraded"): EventFragment;
}

export type AdminChangedEvent = TypedEvent<
  [string, string],
  { previousAdmin: string; newAdmin: string }
>;

export type AdminChangedEventFilter = TypedEventFilter<AdminChangedEvent>;

export type BeaconUpgradedEvent = TypedEvent<[string], { beacon: string }>;

export type BeaconUpgradedEventFilter = TypedEventFilter<BeaconUpgradedEvent>;

export type InitializedEvent = TypedEvent<[number], { version: number }>;

export type InitializedEventFilter = TypedEventFilter<InitializedEvent>;

export type UpgradedEvent = TypedEvent<[string], { implementation: string }>;

export type UpgradedEventFilter = TypedEventFilter<UpgradedEvent>;

export interface PoolV2 extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: PoolV2Interface;

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
    ETH(overrides?: CallOverrides): Promise<[string]>;

    afterAgreementCreated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    afterAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    afterAgreementUpdated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    beforeAgreementCreated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<[string]>;

    beforeAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<[string]>;

    beforeAgreementUpdated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<[string]>;

    cfa(overrides?: CallOverrides): Promise<[string]>;

    closeAccount(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    gelato(overrides?: CallOverrides): Promise<[string]>;

    getLastPool(overrides?: CallOverrides): Promise<[PoolV2StructOutput]>;

    getPool(
      timestamp: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[PoolV2StructOutput]>;

    host(overrides?: CallOverrides): Promise<[string]>;

    initialize(
      _host: string,
      _superToken: string,
      _token: string,
      _owner: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    initializeAfterSettings(
      _resolverSettings: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    lastPoolTimestamp(overrides?: CallOverrides): Promise<[BigNumber]>;

    ops(overrides?: CallOverrides): Promise<[string]>;

    proxiableUUID(overrides?: CallOverrides): Promise<[string]>;

    redeemDeposit(
      redeemAmount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    redeemFlow(
      _outFlowRate: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    redeemFlowStop(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    sfCreateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    sfDeleteFlow(
      sender: string,
      receiver: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    sfDeleteFlowWithCtx(
      _ctx: BytesLike,
      sender: string,
      receiver: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    sfUpdateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    tokensReceived(
      operator: string,
      from: string,
      to: string,
      amount: BigNumberish,
      userData: BytesLike,
      operatorData: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    transfer(
      _amount: BigNumberish,
      _paymentToken: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    transferSuperToken(
      receiver: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    upgradeTo(
      newImplementation: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    upgradeToAndCall(
      newImplementation: string,
      data: BytesLike,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    withdraw(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;
  };

  ETH(overrides?: CallOverrides): Promise<string>;

  afterAgreementCreated(
    _superToken: string,
    _agreementClass: string,
    arg2: BytesLike,
    _agreementData: BytesLike,
    arg4: BytesLike,
    _ctx: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  afterAgreementTerminated(
    arg0: string,
    arg1: string,
    arg2: BytesLike,
    _agreementData: BytesLike,
    arg4: BytesLike,
    _ctx: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  afterAgreementUpdated(
    _superToken: string,
    _agreementClass: string,
    arg2: BytesLike,
    _agreementData: BytesLike,
    arg4: BytesLike,
    _ctx: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  beforeAgreementCreated(
    arg0: string,
    arg1: string,
    arg2: BytesLike,
    arg3: BytesLike,
    arg4: BytesLike,
    overrides?: CallOverrides
  ): Promise<string>;

  beforeAgreementTerminated(
    arg0: string,
    arg1: string,
    arg2: BytesLike,
    arg3: BytesLike,
    arg4: BytesLike,
    overrides?: CallOverrides
  ): Promise<string>;

  beforeAgreementUpdated(
    arg0: string,
    arg1: string,
    arg2: BytesLike,
    arg3: BytesLike,
    arg4: BytesLike,
    overrides?: CallOverrides
  ): Promise<string>;

  cfa(overrides?: CallOverrides): Promise<string>;

  closeAccount(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  gelato(overrides?: CallOverrides): Promise<string>;

  getLastPool(overrides?: CallOverrides): Promise<PoolV2StructOutput>;

  getPool(
    timestamp: BigNumberish,
    overrides?: CallOverrides
  ): Promise<PoolV2StructOutput>;

  host(overrides?: CallOverrides): Promise<string>;

  initialize(
    _host: string,
    _superToken: string,
    _token: string,
    _owner: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  initializeAfterSettings(
    _resolverSettings: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  lastPoolTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

  ops(overrides?: CallOverrides): Promise<string>;

  proxiableUUID(overrides?: CallOverrides): Promise<string>;

  redeemDeposit(
    redeemAmount: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  redeemFlow(
    _outFlowRate: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  redeemFlowStop(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  sfCreateFlow(
    receiver: string,
    newOutFlow: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  sfDeleteFlow(
    sender: string,
    receiver: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  sfDeleteFlowWithCtx(
    _ctx: BytesLike,
    sender: string,
    receiver: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  sfUpdateFlow(
    receiver: string,
    newOutFlow: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  tokensReceived(
    operator: string,
    from: string,
    to: string,
    amount: BigNumberish,
    userData: BytesLike,
    operatorData: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  transfer(
    _amount: BigNumberish,
    _paymentToken: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  transferSuperToken(
    receiver: string,
    amount: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  upgradeTo(
    newImplementation: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  upgradeToAndCall(
    newImplementation: string,
    data: BytesLike,
    overrides?: PayableOverrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  withdraw(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    ETH(overrides?: CallOverrides): Promise<string>;

    afterAgreementCreated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: CallOverrides
    ): Promise<string>;

    afterAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: CallOverrides
    ): Promise<string>;

    afterAgreementUpdated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: CallOverrides
    ): Promise<string>;

    beforeAgreementCreated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<string>;

    beforeAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<string>;

    beforeAgreementUpdated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<string>;

    cfa(overrides?: CallOverrides): Promise<string>;

    closeAccount(overrides?: CallOverrides): Promise<void>;

    gelato(overrides?: CallOverrides): Promise<string>;

    getLastPool(overrides?: CallOverrides): Promise<PoolV2StructOutput>;

    getPool(
      timestamp: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PoolV2StructOutput>;

    host(overrides?: CallOverrides): Promise<string>;

    initialize(
      _host: string,
      _superToken: string,
      _token: string,
      _owner: string,
      overrides?: CallOverrides
    ): Promise<void>;

    initializeAfterSettings(
      _resolverSettings: string,
      overrides?: CallOverrides
    ): Promise<void>;

    lastPoolTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

    ops(overrides?: CallOverrides): Promise<string>;

    proxiableUUID(overrides?: CallOverrides): Promise<string>;

    redeemDeposit(
      redeemAmount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    redeemFlow(
      _outFlowRate: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    redeemFlowStop(overrides?: CallOverrides): Promise<void>;

    sfCreateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    sfDeleteFlow(
      sender: string,
      receiver: string,
      overrides?: CallOverrides
    ): Promise<void>;

    sfDeleteFlowWithCtx(
      _ctx: BytesLike,
      sender: string,
      receiver: string,
      overrides?: CallOverrides
    ): Promise<string>;

    sfUpdateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    tokensReceived(
      operator: string,
      from: string,
      to: string,
      amount: BigNumberish,
      userData: BytesLike,
      operatorData: BytesLike,
      overrides?: CallOverrides
    ): Promise<void>;

    transfer(
      _amount: BigNumberish,
      _paymentToken: string,
      overrides?: CallOverrides
    ): Promise<void>;

    transferSuperToken(
      receiver: string,
      amount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    upgradeTo(
      newImplementation: string,
      overrides?: CallOverrides
    ): Promise<void>;

    upgradeToAndCall(
      newImplementation: string,
      data: BytesLike,
      overrides?: CallOverrides
    ): Promise<void>;

    withdraw(overrides?: CallOverrides): Promise<boolean>;
  };

  filters: {
    "AdminChanged(address,address)"(
      previousAdmin?: null,
      newAdmin?: null
    ): AdminChangedEventFilter;
    AdminChanged(
      previousAdmin?: null,
      newAdmin?: null
    ): AdminChangedEventFilter;

    "BeaconUpgraded(address)"(
      beacon?: string | null
    ): BeaconUpgradedEventFilter;
    BeaconUpgraded(beacon?: string | null): BeaconUpgradedEventFilter;

    "Initialized(uint8)"(version?: null): InitializedEventFilter;
    Initialized(version?: null): InitializedEventFilter;

    "Upgraded(address)"(implementation?: string | null): UpgradedEventFilter;
    Upgraded(implementation?: string | null): UpgradedEventFilter;
  };

  estimateGas: {
    ETH(overrides?: CallOverrides): Promise<BigNumber>;

    afterAgreementCreated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    afterAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    afterAgreementUpdated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    beforeAgreementCreated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    beforeAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    beforeAgreementUpdated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    cfa(overrides?: CallOverrides): Promise<BigNumber>;

    closeAccount(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    gelato(overrides?: CallOverrides): Promise<BigNumber>;

    getLastPool(overrides?: CallOverrides): Promise<BigNumber>;

    getPool(
      timestamp: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    host(overrides?: CallOverrides): Promise<BigNumber>;

    initialize(
      _host: string,
      _superToken: string,
      _token: string,
      _owner: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    initializeAfterSettings(
      _resolverSettings: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    lastPoolTimestamp(overrides?: CallOverrides): Promise<BigNumber>;

    ops(overrides?: CallOverrides): Promise<BigNumber>;

    proxiableUUID(overrides?: CallOverrides): Promise<BigNumber>;

    redeemDeposit(
      redeemAmount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    redeemFlow(
      _outFlowRate: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    redeemFlowStop(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    sfCreateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    sfDeleteFlow(
      sender: string,
      receiver: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    sfDeleteFlowWithCtx(
      _ctx: BytesLike,
      sender: string,
      receiver: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    sfUpdateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    tokensReceived(
      operator: string,
      from: string,
      to: string,
      amount: BigNumberish,
      userData: BytesLike,
      operatorData: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    transfer(
      _amount: BigNumberish,
      _paymentToken: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    transferSuperToken(
      receiver: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    upgradeTo(
      newImplementation: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    upgradeToAndCall(
      newImplementation: string,
      data: BytesLike,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    withdraw(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    ETH(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    afterAgreementCreated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    afterAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    afterAgreementUpdated(
      _superToken: string,
      _agreementClass: string,
      arg2: BytesLike,
      _agreementData: BytesLike,
      arg4: BytesLike,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    beforeAgreementCreated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    beforeAgreementTerminated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    beforeAgreementUpdated(
      arg0: string,
      arg1: string,
      arg2: BytesLike,
      arg3: BytesLike,
      arg4: BytesLike,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    cfa(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    closeAccount(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    gelato(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getLastPool(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getPool(
      timestamp: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    host(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    initialize(
      _host: string,
      _superToken: string,
      _token: string,
      _owner: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    initializeAfterSettings(
      _resolverSettings: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    lastPoolTimestamp(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    ops(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    proxiableUUID(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    redeemDeposit(
      redeemAmount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    redeemFlow(
      _outFlowRate: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    redeemFlowStop(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    sfCreateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    sfDeleteFlow(
      sender: string,
      receiver: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    sfDeleteFlowWithCtx(
      _ctx: BytesLike,
      sender: string,
      receiver: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    sfUpdateFlow(
      receiver: string,
      newOutFlow: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    tokensReceived(
      operator: string,
      from: string,
      to: string,
      amount: BigNumberish,
      userData: BytesLike,
      operatorData: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    transfer(
      _amount: BigNumberish,
      _paymentToken: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    transferSuperToken(
      receiver: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    upgradeTo(
      newImplementation: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    upgradeToAndCall(
      newImplementation: string,
      data: BytesLike,
      overrides?: PayableOverrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    withdraw(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;
  };
}
