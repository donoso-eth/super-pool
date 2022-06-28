import { BigNumber, Contract, logger, utils } from 'ethers';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { hexlify, keccak256, RLP, toUtf8Bytes } from 'ethers/lib/utils';
import { Network } from 'hardhat/types';
import { ethers, network } from 'hardhat';
import { PeriodStruct, PeriodStructOutput, SuperPool } from '../../typechain-types/SuperPool';
import { PoolFactory } from '../../typechain-types';



////// CONTRACTS

export const printPeriod = async (superTokenPool: PoolFactory, t0:number):Promise<any>  => {

  let periodTimestamp = +((await superTokenPool.lastPeriodTimestamp()).toString());
  let period = await superTokenPool.periodByTimestamp(periodTimestamp);
  console.log(period.timestamp.toString());

  console.log('\x1b[36m%s\x1b[0m','XXXXXXXXXXXXXXXXXXXX   PERIOD    XXXXXXXXXXXXXXXXXXXXX')
  console.log(`TimeStamp ${+period.timestamp.toString()-t0} `)
  console.log(`In-Flow ${period.inFlowRate.toString()}  units/s`)
  console.log(`Out-Flow ${period.outFlowRate.toString()}  units/s`)
  console.log(`Deposit From InFlow ${period.depositFromInFlowRate.toString()}  units`)
  console.log(`Deposit From OutFlow ${period.depositFromOutFlowRate.toString()}  units`)
  console.log(`Deposit ${period.deposit.toString()}  units`)
  console.log(`IndexYieldToken: ${period.yieldTokenIndex.toString()}  units`)
  console.log(`IndexYieldInFlowrate: ${period.yieldInFlowRateIndex.toString()}  units`)
  console.log(`IndexYieldOutFlowrate: ${period.yieldOutFlowRateIndex.toString()}  units`)
  console.log(`Yield Per Second: ${period.yieldAccruedSec.toString()}  units`)
  console.log('\x1b[36m%s\x1b[0m','XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  return period;
}

export const printUser = async(superTokenPool:PoolFactory, userAddress:string):Promise<any> => {

  let user = await superTokenPool.suppliersByAddress(userAddress);

  console.log('\x1b[32m%s\x1b[0m','XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX')
  console.log(`User ${user.supplier.toString()} `)
  console.log(`In-Flow  ${user.inStream.flow.toString()} units/s, `)
  console.log(`Out-Flow  ${user.outStream.flow.toString()} units/s`)
  console.log(`Deposit ${user.deposit.amount.toString()}  units`)
  console.log(`TimeStamp ${user.timestamp.toString()}  units`)
  console.log(`Cumulative Yield: ${user.cumulatedYield.toString()}  units`)
  console.log('\x1b[32m%s\x1b[0m','XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  return user;
}


export function matchEvent(receipt: TransactionReceipt, name: string, eventContract: Contract,expectedArgs?: any[], ): void {
  const events = receipt.logs;

  if (events != undefined) {
    // match name from list of events in eventContract, when found, compute the sigHash
    let sigHash: string | undefined;
    for (let contractEvents of Object.keys(eventContract.interface.events)) {
      if (contractEvents.startsWith(name) && contractEvents.charAt(name.length) == '(') {
        sigHash = keccak256(toUtf8Bytes(contractEvents));
        break;
      }
    }
    // Throw if the sigHash was not found
    if (!sigHash) {
      logger.throwError(`Event "${name}" not found in provided contract (default: Events libary). \nAre you sure you're using the right contract?`);
    }

    // Find the given event in the emitted logs
    let invalidParamsButExists = false;
    for (let emittedEvent of events) {
      // If we find one with the correct sighash, check if it is the one we're looking for
      if (emittedEvent.topics[0] == sigHash) {
        const event = eventContract.interface.parseLog(emittedEvent);
        // If there are expected arguments, validate them, otherwise, return here
        if (expectedArgs) {
          // if (expectedArgs.length != event.args.length) {
          //   logger.throwError(`Event "${name}" emitted with correct signature, but expected args are of invalid length`);
          // }
          invalidParamsButExists = false;
          // Iterate through arguments and check them, if there is a mismatch, continue with the loop
          for (let i = 0; i < expectedArgs.length; i++) {
            // Parse empty arrays as empty bytes
            if (expectedArgs[i].constructor == Array && expectedArgs[i].length == 0) {
              expectedArgs[i] = '0x';
            }
      
            // Break out of the expected args loop if there is a mismatch, this will continue the emitted event loop
            if (BigNumber.isBigNumber(event.args[i])) {
              if (!event.args[i].eq(BigNumber.from(expectedArgs[i]))) {
                invalidParamsButExists = true;
                break;
              }
            } else if (event.args[i].constructor == Array) {
              let params = event.args[i];
              let expected = expectedArgs[i];
              if (matchRecursiveArray(expected,params) == true){
                invalidParamsButExists = true;
                break;
              }
              if (invalidParamsButExists) break;
            } else if (event.args[i] != expectedArgs[i]) {
              invalidParamsButExists = true;
              break;
            }
          }
          // Return if the for loop did not cause a break, so a match has been found, otherwise proceed with the event loop
          if (!invalidParamsButExists) {
            return;
          }
        } else {
          return;
        }
      }
    }
    // Throw if the event args were not expected or the event was not found in the logs
    if (invalidParamsButExists) {
      logger.throwError(`Event "${name}" found in logs but with unexpected args`);
    } else {
      logger.throwError(`Event "${name}" not found in given transaction log`);
    }
  } else {
    logger.throwError('No events were emitted');
  }
}

function matchRecursiveArray(expected:Array<any>,params:Array<any>){
  let invalidParamsButExists = false
  for (let j = 0; j < params.length; j++) {

    if (BigNumber.isBigNumber(params[j])) {
      if (!params[j].eq(BigNumber.from(expected[j]))) {
       return invalidParamsButExists = true;
      }
    }  else if (params[j].constructor == Array) {
      let paramsRec = params[j];
      let expectedRec = expected[j];
      if (matchRecursiveArray(expectedRec,paramsRec) == true){
        invalidParamsButExists = true;
       return invalidParamsButExists
      }
    
    }
    

    else if (params[j] != expected[j]) {
      invalidParamsButExists = true;
     return true
    }
    
  }
  return invalidParamsButExists
}



////// BLOCKCHAIN


export async function increaseBlockTime(network: Network, increment: number) {
  await network.provider.send('evm_increaseTime', [increment]);
}

export async function getTimestamp(): Promise<any> {
  const blockNumber = await ethers.provider.send('eth_blockNumber', []);
  const block = await ethers.provider.send('eth_getBlockByNumber', [blockNumber, false]);
  return block.timestamp;
}

export async function resetFork(): Promise<void> {
  await network.provider.request({
    method: 'hardhat_reset',
    params: [
      {
        forking: {
          jsonRpcUrl: process.env.MUMBAI_URL || '',
          blockNumber:  26376362,
        },
      },
    ],
  });
}
