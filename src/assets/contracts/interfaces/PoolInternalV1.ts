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
import { FunctionFragment, Result } from "@ethersproject/abi";
import { Listener, Provider } from "@ethersproject/providers";
import { TypedEventFilter, TypedEvent, TypedListener, OnEvent } from "./common";

export type YieldStruct = {
  yieldTokenIndex: BigNumberish;
  yieldInFlowRateIndex: BigNumberish;
  yieldOutFlowRateIndex: BigNumberish;
  yieldAccrued: BigNumberish;
  yieldSnapshot: BigNumberish;
  totalYield: BigNumberish;
  protocolYield: BigNumberish;
};

export type YieldStructOutput = [
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber
] & {
  yieldTokenIndex: BigNumber;
  yieldInFlowRateIndex: BigNumber;
  yieldOutFlowRateIndex: BigNumber;
  yieldAccrued: BigNumber;
  yieldSnapshot: BigNumber;
  totalYield: BigNumber;
  protocolYield: BigNumber;
};

export type PoolStruct = {
  id: BigNumberish;
  timestamp: BigNumberish;
  nrSuppliers: BigNumberish;
  deposit: BigNumberish;
  depositFromInFlowRate: BigNumberish;
  depositFromOutFlowRate: BigNumberish;
  inFlowRate: BigNumberish;
  outFlowRate: BigNumberish;
  outFlowBuffer: BigNumberish;
  yieldObject: YieldStruct;
};

export type PoolStructOutput = [
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  BigNumber,
  YieldStructOutput
] & {
  id: BigNumber;
  timestamp: BigNumber;
  nrSuppliers: BigNumber;
  deposit: BigNumber;
  depositFromInFlowRate: BigNumber;
  depositFromOutFlowRate: BigNumber;
  inFlowRate: BigNumber;
  outFlowRate: BigNumber;
  outFlowBuffer: BigNumber;
  yieldObject: YieldStructOutput;
};

export interface PoolInternalV1Interface extends utils.Interface {
  functions: {
    "ETH()": FunctionFragment;
    "_allowances(address,address)": FunctionFragment;
    "_balanceTreasury((uint256,uint256,uint256,uint256,uint256,uint256,int96,int96,uint256,(uint256,uint256,uint256,uint256,uint256,uint256,uint256)))": FunctionFragment;
    "_balanceTreasuryFromGelato()": FunctionFragment;
    "_balances(address)": FunctionFragment;
    "_calculateIndexes(uint256,(uint256,uint256,uint256,uint256,uint256,uint256,int96,int96,uint256,(uint256,uint256,uint256,uint256,uint256,uint256,uint256)))": FunctionFragment;
    "_calculateYieldSupplier(address)": FunctionFragment;
    "_closeAccount(address)": FunctionFragment;
    "_createBalanceTreasuryTask()": FunctionFragment;
    "_getSupplierBalance(address)": FunctionFragment;
    "_name()": FunctionFragment;
    "_poolUpdate()": FunctionFragment;
    "_redeemDeposit(address,uint256)": FunctionFragment;
    "_redeemFlow(address,int96)": FunctionFragment;
    "_redeemFlowStop(address)": FunctionFragment;
    "_symbol()": FunctionFragment;
    "_tokensReceived(address,uint256)": FunctionFragment;
    "_totalSupply()": FunctionFragment;
    "_updateSupplierFlow(address,int96,int96,bytes)": FunctionFragment;
    "balanceTreasuryTask()": FunctionFragment;
    "cancelTask(bytes32)": FunctionFragment;
    "closeStreamFlow(address)": FunctionFragment;
    "gelato()": FunctionFragment;
    "getVersion()": FunctionFragment;
    "ops()": FunctionFragment;
    "poolInternal()": FunctionFragment;
    "poolStrategy()": FunctionFragment;
    "totalYieldEarnedSupplier(address,uint256)": FunctionFragment;
    "transferSPTokens(address,address,uint256)": FunctionFragment;
  };

  encodeFunctionData(functionFragment: "ETH", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "_allowances",
    values: [string, string]
  ): string;
  encodeFunctionData(
    functionFragment: "_balanceTreasury",
    values: [PoolStruct]
  ): string;
  encodeFunctionData(
    functionFragment: "_balanceTreasuryFromGelato",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "_balances", values: [string]): string;
  encodeFunctionData(
    functionFragment: "_calculateIndexes",
    values: [BigNumberish, PoolStruct]
  ): string;
  encodeFunctionData(
    functionFragment: "_calculateYieldSupplier",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "_closeAccount",
    values: [string]
  ): string;
  encodeFunctionData(
    functionFragment: "_createBalanceTreasuryTask",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "_getSupplierBalance",
    values: [string]
  ): string;
  encodeFunctionData(functionFragment: "_name", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "_poolUpdate",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "_redeemDeposit",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "_redeemFlow",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "_redeemFlowStop",
    values: [string]
  ): string;
  encodeFunctionData(functionFragment: "_symbol", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "_tokensReceived",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "_totalSupply",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "_updateSupplierFlow",
    values: [string, BigNumberish, BigNumberish, BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "balanceTreasuryTask",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "cancelTask",
    values: [BytesLike]
  ): string;
  encodeFunctionData(
    functionFragment: "closeStreamFlow",
    values: [string]
  ): string;
  encodeFunctionData(functionFragment: "gelato", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "getVersion",
    values?: undefined
  ): string;
  encodeFunctionData(functionFragment: "ops", values?: undefined): string;
  encodeFunctionData(
    functionFragment: "poolInternal",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "poolStrategy",
    values?: undefined
  ): string;
  encodeFunctionData(
    functionFragment: "totalYieldEarnedSupplier",
    values: [string, BigNumberish]
  ): string;
  encodeFunctionData(
    functionFragment: "transferSPTokens",
    values: [string, string, BigNumberish]
  ): string;

  decodeFunctionResult(functionFragment: "ETH", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "_allowances",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_balanceTreasury",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_balanceTreasuryFromGelato",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "_balances", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "_calculateIndexes",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_calculateYieldSupplier",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_closeAccount",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_createBalanceTreasuryTask",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_getSupplierBalance",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "_name", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "_poolUpdate",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_redeemDeposit",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_redeemFlow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_redeemFlowStop",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "_symbol", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "_tokensReceived",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_totalSupply",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "_updateSupplierFlow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "balanceTreasuryTask",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "cancelTask", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "closeStreamFlow",
    data: BytesLike
  ): Result;
  decodeFunctionResult(functionFragment: "gelato", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "getVersion", data: BytesLike): Result;
  decodeFunctionResult(functionFragment: "ops", data: BytesLike): Result;
  decodeFunctionResult(
    functionFragment: "poolInternal",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "poolStrategy",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "totalYieldEarnedSupplier",
    data: BytesLike
  ): Result;
  decodeFunctionResult(
    functionFragment: "transferSPTokens",
    data: BytesLike
  ): Result;

  events: {};
}

export interface PoolInternalV1 extends BaseContract {
  connect(signerOrProvider: Signer | Provider | string): this;
  attach(addressOrName: string): this;
  deployed(): Promise<this>;

  interface: PoolInternalV1Interface;

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

    _allowances(
      arg0: string,
      arg1: string,
      overrides?: CallOverrides
    ): Promise<[BigNumber]>;

    _balanceTreasury(
      currentPool: PoolStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _balanceTreasuryFromGelato(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _balances(arg0: string, overrides?: CallOverrides): Promise<[BigNumber]>;

    _calculateIndexes(
      yieldPeriod: BigNumberish,
      lastPool: PoolStruct,
      overrides?: CallOverrides
    ): Promise<
      [BigNumber, BigNumber, BigNumber] & {
        periodYieldTokenIndex: BigNumber;
        periodYieldInFlowRateIndex: BigNumber;
        periodYieldOutFlowRateIndex: BigNumber;
      }
    >;

    _calculateYieldSupplier(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { yieldSupplier: BigNumber }>;

    _closeAccount(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _createBalanceTreasuryTask(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _getSupplierBalance(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { realtimeBalance: BigNumber }>;

    _name(overrides?: CallOverrides): Promise<[string]>;

    _poolUpdate(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _redeemDeposit(
      _supplier: string,
      redeemAmount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _redeemFlow(
      _supplier: string,
      _outFlowRate: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _redeemFlowStop(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _symbol(overrides?: CallOverrides): Promise<[string]>;

    _tokensReceived(
      _supplier: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    _totalSupply(overrides?: CallOverrides): Promise<[BigNumber]>;

    _updateSupplierFlow(
      _supplier: string,
      inFlow: BigNumberish,
      outFlow: BigNumberish,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    balanceTreasuryTask(overrides?: CallOverrides): Promise<[string]>;

    cancelTask(
      _taskId: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    closeStreamFlow(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;

    gelato(overrides?: CallOverrides): Promise<[string]>;

    getVersion(overrides?: CallOverrides): Promise<[BigNumber]>;

    ops(overrides?: CallOverrides): Promise<[string]>;

    poolInternal(overrides?: CallOverrides): Promise<[string]>;

    poolStrategy(overrides?: CallOverrides): Promise<[string]>;

    totalYieldEarnedSupplier(
      _supplier: string,
      currentYieldSnapshot: BigNumberish,
      overrides?: CallOverrides
    ): Promise<[BigNumber] & { yieldSupplier: BigNumber }>;

    transferSPTokens(
      _sender: string,
      _receiver: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<ContractTransaction>;
  };

  ETH(overrides?: CallOverrides): Promise<string>;

  _allowances(
    arg0: string,
    arg1: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  _balanceTreasury(
    currentPool: PoolStruct,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _balanceTreasuryFromGelato(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _balances(arg0: string, overrides?: CallOverrides): Promise<BigNumber>;

  _calculateIndexes(
    yieldPeriod: BigNumberish,
    lastPool: PoolStruct,
    overrides?: CallOverrides
  ): Promise<
    [BigNumber, BigNumber, BigNumber] & {
      periodYieldTokenIndex: BigNumber;
      periodYieldInFlowRateIndex: BigNumber;
      periodYieldOutFlowRateIndex: BigNumber;
    }
  >;

  _calculateYieldSupplier(
    _supplier: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  _closeAccount(
    _supplier: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _createBalanceTreasuryTask(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _getSupplierBalance(
    _supplier: string,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  _name(overrides?: CallOverrides): Promise<string>;

  _poolUpdate(
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _redeemDeposit(
    _supplier: string,
    redeemAmount: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _redeemFlow(
    _supplier: string,
    _outFlowRate: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _redeemFlowStop(
    _supplier: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _symbol(overrides?: CallOverrides): Promise<string>;

  _tokensReceived(
    _supplier: string,
    amount: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  _totalSupply(overrides?: CallOverrides): Promise<BigNumber>;

  _updateSupplierFlow(
    _supplier: string,
    inFlow: BigNumberish,
    outFlow: BigNumberish,
    _ctx: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  balanceTreasuryTask(overrides?: CallOverrides): Promise<string>;

  cancelTask(
    _taskId: BytesLike,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  closeStreamFlow(
    _supplier: string,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  gelato(overrides?: CallOverrides): Promise<string>;

  getVersion(overrides?: CallOverrides): Promise<BigNumber>;

  ops(overrides?: CallOverrides): Promise<string>;

  poolInternal(overrides?: CallOverrides): Promise<string>;

  poolStrategy(overrides?: CallOverrides): Promise<string>;

  totalYieldEarnedSupplier(
    _supplier: string,
    currentYieldSnapshot: BigNumberish,
    overrides?: CallOverrides
  ): Promise<BigNumber>;

  transferSPTokens(
    _sender: string,
    _receiver: string,
    amount: BigNumberish,
    overrides?: Overrides & { from?: string | Promise<string> }
  ): Promise<ContractTransaction>;

  callStatic: {
    ETH(overrides?: CallOverrides): Promise<string>;

    _allowances(
      arg0: string,
      arg1: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    _balanceTreasury(
      currentPool: PoolStruct,
      overrides?: CallOverrides
    ): Promise<PoolStructOutput>;

    _balanceTreasuryFromGelato(overrides?: CallOverrides): Promise<void>;

    _balances(arg0: string, overrides?: CallOverrides): Promise<BigNumber>;

    _calculateIndexes(
      yieldPeriod: BigNumberish,
      lastPool: PoolStruct,
      overrides?: CallOverrides
    ): Promise<
      [BigNumber, BigNumber, BigNumber] & {
        periodYieldTokenIndex: BigNumber;
        periodYieldInFlowRateIndex: BigNumber;
        periodYieldOutFlowRateIndex: BigNumber;
      }
    >;

    _calculateYieldSupplier(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    _closeAccount(_supplier: string, overrides?: CallOverrides): Promise<void>;

    _createBalanceTreasuryTask(overrides?: CallOverrides): Promise<string>;

    _getSupplierBalance(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    _name(overrides?: CallOverrides): Promise<string>;

    _poolUpdate(overrides?: CallOverrides): Promise<void>;

    _redeemDeposit(
      _supplier: string,
      redeemAmount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    _redeemFlow(
      _supplier: string,
      _outFlowRate: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    _redeemFlowStop(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<void>;

    _symbol(overrides?: CallOverrides): Promise<string>;

    _tokensReceived(
      _supplier: string,
      amount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;

    _totalSupply(overrides?: CallOverrides): Promise<BigNumber>;

    _updateSupplierFlow(
      _supplier: string,
      inFlow: BigNumberish,
      outFlow: BigNumberish,
      _ctx: BytesLike,
      overrides?: CallOverrides
    ): Promise<string>;

    balanceTreasuryTask(overrides?: CallOverrides): Promise<string>;

    cancelTask(_taskId: BytesLike, overrides?: CallOverrides): Promise<void>;

    closeStreamFlow(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<void>;

    gelato(overrides?: CallOverrides): Promise<string>;

    getVersion(overrides?: CallOverrides): Promise<BigNumber>;

    ops(overrides?: CallOverrides): Promise<string>;

    poolInternal(overrides?: CallOverrides): Promise<string>;

    poolStrategy(overrides?: CallOverrides): Promise<string>;

    totalYieldEarnedSupplier(
      _supplier: string,
      currentYieldSnapshot: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    transferSPTokens(
      _sender: string,
      _receiver: string,
      amount: BigNumberish,
      overrides?: CallOverrides
    ): Promise<void>;
  };

  filters: {};

  estimateGas: {
    ETH(overrides?: CallOverrides): Promise<BigNumber>;

    _allowances(
      arg0: string,
      arg1: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    _balanceTreasury(
      currentPool: PoolStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _balanceTreasuryFromGelato(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _balances(arg0: string, overrides?: CallOverrides): Promise<BigNumber>;

    _calculateIndexes(
      yieldPeriod: BigNumberish,
      lastPool: PoolStruct,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    _calculateYieldSupplier(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    _closeAccount(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _createBalanceTreasuryTask(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _getSupplierBalance(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    _name(overrides?: CallOverrides): Promise<BigNumber>;

    _poolUpdate(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _redeemDeposit(
      _supplier: string,
      redeemAmount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _redeemFlow(
      _supplier: string,
      _outFlowRate: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _redeemFlowStop(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _symbol(overrides?: CallOverrides): Promise<BigNumber>;

    _tokensReceived(
      _supplier: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    _totalSupply(overrides?: CallOverrides): Promise<BigNumber>;

    _updateSupplierFlow(
      _supplier: string,
      inFlow: BigNumberish,
      outFlow: BigNumberish,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    balanceTreasuryTask(overrides?: CallOverrides): Promise<BigNumber>;

    cancelTask(
      _taskId: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    closeStreamFlow(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;

    gelato(overrides?: CallOverrides): Promise<BigNumber>;

    getVersion(overrides?: CallOverrides): Promise<BigNumber>;

    ops(overrides?: CallOverrides): Promise<BigNumber>;

    poolInternal(overrides?: CallOverrides): Promise<BigNumber>;

    poolStrategy(overrides?: CallOverrides): Promise<BigNumber>;

    totalYieldEarnedSupplier(
      _supplier: string,
      currentYieldSnapshot: BigNumberish,
      overrides?: CallOverrides
    ): Promise<BigNumber>;

    transferSPTokens(
      _sender: string,
      _receiver: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<BigNumber>;
  };

  populateTransaction: {
    ETH(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    _allowances(
      arg0: string,
      arg1: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    _balanceTreasury(
      currentPool: PoolStruct,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _balanceTreasuryFromGelato(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _balances(
      arg0: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    _calculateIndexes(
      yieldPeriod: BigNumberish,
      lastPool: PoolStruct,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    _calculateYieldSupplier(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    _closeAccount(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _createBalanceTreasuryTask(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _getSupplierBalance(
      _supplier: string,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    _name(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    _poolUpdate(
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _redeemDeposit(
      _supplier: string,
      redeemAmount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _redeemFlow(
      _supplier: string,
      _outFlowRate: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _redeemFlowStop(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _symbol(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    _tokensReceived(
      _supplier: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    _totalSupply(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    _updateSupplierFlow(
      _supplier: string,
      inFlow: BigNumberish,
      outFlow: BigNumberish,
      _ctx: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    balanceTreasuryTask(
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    cancelTask(
      _taskId: BytesLike,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    closeStreamFlow(
      _supplier: string,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;

    gelato(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    getVersion(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    ops(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    poolInternal(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    poolStrategy(overrides?: CallOverrides): Promise<PopulatedTransaction>;

    totalYieldEarnedSupplier(
      _supplier: string,
      currentYieldSnapshot: BigNumberish,
      overrides?: CallOverrides
    ): Promise<PopulatedTransaction>;

    transferSPTokens(
      _sender: string,
      _receiver: string,
      amount: BigNumberish,
      overrides?: Overrides & { from?: string | Promise<string> }
    ): Promise<PopulatedTransaction>;
  };
}
