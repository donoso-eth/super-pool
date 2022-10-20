
import { Pool, Supplier,Event } from '../generated/schema';
import { PoolUpdate, SupplierEvent, SupplierUpdate} from '../generated/PoolV2/PoolV2'
import { BigInt } from '@graphprotocol/graph-ts';

export function handlePoolUpdate(event: PoolUpdate): void {
  let id = event.params.pool.id.toString();
  let poolEvent = event.params.pool;

  let pool= Pool.load(id);
  if (pool == null) { 
    pool  = new Pool(id);
    pool.timestamp = poolEvent.timestamp;
    pool.deposit = pool.deposit;
    pool.depositFromInflowRate = pool.depositFromInflowRate;
    pool.inFlowRate= poolEvent.inFlowRate;
    pool.outFlowRate = poolEvent.outFlowRate;
    pool.yieldTokenIndex = poolEvent.yieldTokenIndex;
    pool.yieldInFlowRateIndex = poolEvent.yieldInFlowRateIndex;
    pool.yieldAccrued = poolEvent.yieldAccrued;
    pool.yieldSnapshot = poolEvent.yieldSnapshot;
    pool.totalYield = poolEvent.totalYield;
    pool.nrSuppliers = poolEvent.nrSuppliers;
    pool.apy  = poolEvent.apy.apy;
    pool.apySpan = poolEvent.apy.span;
    pool.save();
  }

}

export function handleSupplierUpdate(event: SupplierUpdate): void {

  let id = event.params.supplier.id.toString();
  let supplier = Supplier.load(id);
  if (supplier == null) {
    supplier = new Supplier(id);
    supplier.supplier = event.params.supplier.supplier.toHexString();
    supplier.createdTimestamp = event.params.supplier.createdTimestamp;
    supplier.cumulatedYield = BigInt.fromI32(0);
  }
  supplier.deposit = event.params.supplier.deposit;
  supplier.timestamp  = event.params.supplier.timestamp;
  supplier.inFlow = event.params.supplier.inStream.flow;
  supplier.inCancelFlowId = event.params.supplier.inStream.cancelFlowId.toHexString();

  let outStream  = event.params.supplier.outStream;
  supplier.outFlow = outStream.flow;
  supplier.outCancelFlowId = outStream.cancelFlowId.toHexString();
  supplier.outStepAmount = outStream.stepAmount;
  supplier.outStepTime = outStream.stepTime;
  supplier.outInitTime = outStream.initTime;
  supplier.outMinBalance = outStream.minBalance;
  supplier.outCancelWithdrawId = outStream.cancelWithdrawId.toHexString();

  supplier.apySpan = event.params.supplier.apy.span;
  supplier.apy = event.params.supplier.apy.apy;

  supplier.save()
  
}

export function handleSupplierEvent(event:SupplierEvent): void {

  let id = event.params.timestmap.toString().concat(event.params.supplier.toHexString());
  let supplierEvent = Event.load(id);

  if (supplierEvent == null) {
    supplierEvent = new Event(id);
    supplierEvent.timestamp = event.params.timestmap;
    supplierEvent.payload = event.params.payload;
    supplierEvent.supplier = event.params.supplier.toHexString();
    supplierEvent.event = BigInt.fromI32(event.params.supplierEvent);
    supplierEvent.save();
  }


}

