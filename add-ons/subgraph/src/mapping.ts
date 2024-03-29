import {Pool, Supplier, Event} from '../generated/schema'
import {PoolUpdate, SupplierEvent,SupplierUpdate} from '../generated/PoolV1/PoolV1'
import {BigInt} from '@graphprotocol/graph-ts'

export function handlePoolUpdate(event: PoolUpdate): void {
  let id = event.params.pool.id.toString();
  let poolEvent = event.params.pool;

  let pool= Pool.load(id);
  if (pool == null) { 
    pool  = new Pool(id);
    pool.timestamp = poolEvent.timestamp;
    pool.deposit = poolEvent.deposit;
    pool.depositFromInflowRate = poolEvent.depositFromInFlowRate;
    pool.depositFromOutflowRate = poolEvent.depositFromOutFlowRate;

    pool.inFlowRate= poolEvent.inFlowRate;
    pool.outFlowRate = poolEvent.outFlowRate;
    pool.outFlowBuffer = poolEvent.outFlowBuffer;
    pool.yieldTokenIndex = poolEvent.yieldObject.yieldTokenIndex;
    pool.yieldInFlowRateIndex = poolEvent.yieldObject.yieldInFlowRateIndex;
    pool.yieldOutFlowRateIndex = poolEvent.yieldObject.yieldOutFlowRateIndex;

    pool.yieldAccrued = poolEvent.yieldObject.yieldAccrued;
    pool.yieldSnapshot = poolEvent.yieldObject.yieldSnapshot;
    pool.totalYield = poolEvent.yieldObject.totalYield;
    pool.protocolYield = poolEvent.yieldObject.protocolYield;
    pool.nrSuppliers = poolEvent.nrSuppliers;

    pool.save();
  }

}

export function handleSupplierUpdate(event: SupplierUpdate): void {

  let id = event.params.supplier.id.toString();
  let supplier = Supplier.load(id);
  if (supplier == null) {
    supplier = new Supplier(id);
    supplier.supplier = event.params.supplier.supplier.toHexString();
    supplier.cumulatedYield = BigInt.fromI32(0);
  }
  supplier.deposit = event.params.supplier.deposit;
  supplier.timestamp  = event.params.supplier.timestamp;
  supplier.inFlow = event.params.supplier.inStream;
 
  let outStream  = event.params.supplier.outStream;
  supplier.outFlow = outStream.flow;

  supplier.outStepTime = outStream.streamDuration;
  supplier.outInitTime = outStream.streamInit;
  supplier.outCancelWithdrawId = outStream.cancelWithdrawId.toHexString();



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

