import { BigNumber, Contract, logger, utils } from 'ethers';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { hexlify, keccak256, RLP, toUtf8Bytes } from 'ethers/lib/utils';
import { Network } from 'hardhat/types';
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { PeriodStruct, PeriodStructOutput, SuperPool } from '../../typechain-types/SuperPool';
import { PoolFactory } from '../../typechain-types';

export interface IPERIOD {
  timestamp: BigNumber;
  deposit: BigNumber;
  inFlowRate: BigNumber;
  outFlowRate: BigNumber;
  depositFromInFlowRate: BigNumber;
  depositFromOutFlowRate: BigNumber;
  yieldTokenIndex: BigNumber;
  yieldInFlowRateIndex: BigNumber;
  yieldOutFlowRateIndex: BigNumber;
  yieldAccruedSec: BigNumber;
  totalShares: BigNumber;
  outFlowAssetsRate?:BigNumber;
}

export const fromBnToNumber = (x: BigNumber) => {
  console.log(x);
  console.log(+x.toString());
  return +x.toString();
};

export interface IPERIOD_RESULT {
  timeElapsed?: BigNumber;
  poolTotalBalance?: BigNumber;
  deposit?: BigNumber;
  inFlowRate?: BigNumber;
  outFlowRate?: BigNumber;
  depositFromInFlowRate?: BigNumber;
  depositFromOutFlowRate?: BigNumber;
  yieldTokenIndex?: BigNumber;
  yieldInFlowRateIndex?: BigNumber;
  yieldOutFlowRateIndex?: BigNumber;
  yieldAccruedSec?: BigNumber;
  totalShares?:BigNumber;
  outFlowAssetsRate?:BigNumber;
}

export interface IUSER_CHECK {
  name: string;
  result: IUSER_RESULT;
  expected: IUSER_RESULT;
}

export interface IUSER_RESULT {
  realTimeBalance?: BigNumber;
  shares?:BigNumber;
  tokenBalance?:BigNumber;
}

export const printPeriodTest = async (result: IPERIOD_RESULT, expected: IPERIOD_RESULT, users?: Array<IUSER_CHECK>) => {
  if (result.poolTotalBalance != undefined) {
    try {
      expect(result.poolTotalBalance).to.equal(expected.poolTotalBalance);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Pool Assets Balance: ${result.poolTotalBalance.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Pool Balance:', `\x1b[30m ${result.poolTotalBalance.toString()}, expected:${expected.poolTotalBalance!.toString()}`);
    }
  }


  if (result.totalShares != undefined) {
    try {
      expect(result.totalShares).to.equal(expected.totalShares);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Pool Shares Balance: ${result.totalShares.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Pool Shares:', `\x1b[30m ${result.totalShares.toString()}, expected:${expected.totalShares!.toString()}`);
    }
  }



  if (result.deposit != undefined) {
    try {
      expect(result.deposit).to.equal(expected.deposit);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Deposit: ${result.deposit.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Deposit:', `\x1b[30m ${result.deposit.toString()}, expected:${expected.deposit!.toString()}`);
    }
  }

  if (result.depositFromOutFlowRate != undefined) {
    try {
      expect(result.depositFromOutFlowRate).to.equal(expected.depositFromOutFlowRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Deposit from Outflow Rate: ${result.depositFromOutFlowRate.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x #Deposit from Outflow Rate:',
        `\x1b[30m ${result.depositFromOutFlowRate.toString()}, expected:${expected.depositFromOutFlowRate!.toString()}`
      );
    }
  }

  if (result.depositFromInFlowRate != undefined) {
    try {
      expect(result.depositFromInFlowRate).to.equal(expected.depositFromInFlowRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Deposit from Inflow Rate: ${result.depositFromInFlowRate.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x #Deposit from Inflow Rate:',
        `\x1b[30m ${result.depositFromInFlowRate.toString()}, expected:${expected.depositFromInFlowRate!.toString()}`
      );
    }
  }

  if (result.inFlowRate != undefined) {
    try {
      expect(result.inFlowRate).to.equal(expected.inFlowRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#In-Flow Rate: ${result.inFlowRate.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #In-Flow Rate:', `\x1b[30m ${result.inFlowRate.toString()}, expected:${expected.inFlowRate!.toString()}`);
    }
  }

  if (result.outFlowRate != undefined) {
    try {
      expect(result.outFlowRate).to.equal(expected.outFlowRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Out-Flow Rate: ${result.outFlowRate.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Out-Flow Rate:', `\x1b[30m ${result.outFlowRate.toString()}, expected:${expected.outFlowRate!.toString()}`);
    }
  }

 

  if (result.outFlowAssetsRate != undefined) {
    try {
      expect(result.outFlowAssetsRate).to.equal(expected.outFlowAssetsRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Out-Flow-ASSETS Rate: ${result.outFlowAssetsRate.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Out-Flow-ASSETS Rate:', `\x1b[30m ${result.outFlowAssetsRate.toString()}, expected:${expected.outFlowAssetsRate!.toString()}`);
    }
  }


  if (result.yieldAccruedSec != undefined) {
    expect(result.yieldAccruedSec).to.equal(expected.yieldAccruedSec);
    console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Yield accrued per sec: ${result.yieldAccruedSec.toString()}`);
  }

  if (result.yieldTokenIndex != undefined) {
    try {
      expect(result.yieldTokenIndex).to.equal(expected.yieldTokenIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield Token: ${result.yieldTokenIndex.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Index Yield Token: ${result.yieldTokenIndex.toString()}, expected:${expected.yieldTokenIndex!.toString()}`);
    }
  }

  if (result.yieldInFlowRateIndex != undefined) {
    try {
      expect(result.yieldInFlowRateIndex).to.equal(expected.yieldInFlowRateIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield In-FLOW : ${result.yieldInFlowRateIndex.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Index Yield In-FLOW: ${result.yieldInFlowRateIndex.toString()}, expected:${expected.yieldInFlowRateIndex!.toString()}`);
    }
  }

  if (result.yieldOutFlowRateIndex != undefined) {
    try {
      expect(result.yieldOutFlowRateIndex).to.equal(expected.yieldOutFlowRateIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield Out-FLOW : ${result.yieldOutFlowRateIndex.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#Index Yield Out-FLOW: ${result.yieldOutFlowRateIndex.toString()}, expected:${expected.yieldOutFlowRateIndex!.toString()}`
      );
    }
  }

  // USERS CHECK

  if (users !== undefined) {
    for (const userToCheck of users) {
      console.log('\x1b[35m%s\x1b[0m', '     ==================================', );

      if (userToCheck.result.realTimeBalance != undefined) {
        try {
          expect(userToCheck.result.realTimeBalance).to.equal(userToCheck.expected.realTimeBalance);
          console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${userToCheck.name} Balance Assets: ${userToCheck.expected.realTimeBalance?.toString()}`);
        } catch (error) {
          console.log(
            '\x1b[31m%s\x1b[0m',
            '    x',
            `\x1b[30m#${userToCheck.name} Balance Assets: ${userToCheck.result.realTimeBalance.toString()}, expected:${userToCheck.expected.realTimeBalance!.toString()}`
          );
          console.log(+userToCheck.result.realTimeBalance.toString()-+userToCheck.expected.realTimeBalance!.toString())
        }
      }

      if (userToCheck.result.shares != undefined) {
        try {
          expect(userToCheck.result.shares).to.equal(userToCheck.expected.shares);
          console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${userToCheck.name} Shares: ${userToCheck.expected.shares?.toString()}`);
        } catch (error) {
          console.log(
            '\x1b[31m%s\x1b[0m',
            '    x',
            `\x1b[30m#${userToCheck.name} Shares : ${userToCheck.result.shares.toString()}, expected:${userToCheck.expected.shares!.toString()}`
          );
          console.log(+userToCheck.result.shares.toString()-+userToCheck.expected.shares!.toString())
        }
      }

      if (userToCheck.result.tokenBalance != undefined) {
        try {
          expect(userToCheck.result.tokenBalance).to.equal(userToCheck.expected.tokenBalance);
          console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${userToCheck.name} Token Balance : ${userToCheck.expected.tokenBalance?.toString()}`);
        } catch (error) {
          console.log(
            '\x1b[31m%s\x1b[0m',
            '    x',
            `\x1b[30m#${userToCheck.name} Token Balance : ${userToCheck.result.tokenBalance.toString()}, expected:${userToCheck.expected.tokenBalance!.toString()}`
          );
          console.log(+userToCheck.result.tokenBalance.toString()-+userToCheck.expected.tokenBalance!.toString())
        }
      }

    }
  }
};

export const getPeriod = async (superTokenPool: PoolFactory): Promise<any> => {
  let periodTimestamp = +(await superTokenPool.lastPeriodTimestamp()).toString();
  let periodRaw = await superTokenPool.periodByTimestamp(periodTimestamp);

  let period: IPERIOD = {
    timestamp: periodRaw.timestamp,
    deposit: periodRaw.deposit,
    inFlowRate: periodRaw.inFlowRate,
    outFlowRate: periodRaw.outFlowRate,
    depositFromInFlowRate: periodRaw.depositFromInFlowRate,
    depositFromOutFlowRate: periodRaw.depositFromOutFlowRate,
    yieldTokenIndex: periodRaw.yieldTokenIndex,
    yieldInFlowRateIndex: periodRaw.yieldInFlowRateIndex,
    yieldOutFlowRateIndex: periodRaw.yieldOutFlowRateIndex,
    yieldAccruedSec: periodRaw.yieldAccruedSec,
    totalShares:periodRaw.totalShares,
    outFlowAssetsRate:periodRaw.outFlowAssetsRate
  };

  return period;
};

////// CONTRACTS

export const printPeriod = async (superTokenPool: PoolFactory, t0: number): Promise<any> => {
  let periodTimestamp = +(await superTokenPool.lastPeriodTimestamp()).toString();
  let period = await superTokenPool.periodByTimestamp(periodTimestamp);
  console.log(period.timestamp.toString());

  console.log('\x1b[36m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXX   PERIOD    XXXXXXXXXXXXXXXXXXXXX');
  console.log(`TimeStamp ${+period.timestamp.toString() - t0} `);
  console.log(`In-Flow ${period.inFlowRate.toString()}  units/s`);
  console.log(`Out-Flow ${period.outFlowRate.toString()}  units/s`);
  console.log(`Deposit From InFlow ${period.depositFromInFlowRate.toString()}  units`);
  console.log(`Deposit From OutFlow ${period.depositFromOutFlowRate.toString()}  units`);
  console.log(`Deposit ${period.deposit.toString()}  units`);
  console.log(`IndexYieldToken: ${period.yieldTokenIndex.toString()}  units`);
  console.log(`IndexYieldInFlowrate: ${period.yieldInFlowRateIndex.toString()}  units`);
  console.log(`IndexYieldOutFlowrate: ${period.yieldOutFlowRateIndex.toString()}  units`);
  console.log(`Yield Per Second: ${period.yieldAccruedSec.toString()}  units`);
  console.log('\x1b[36m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  return period;
};

export const printUser = async (superTokenPool: PoolFactory, userAddress: string): Promise<any> => {
  let user = await superTokenPool.suppliersByAddress(userAddress);

  console.log('\x1b[32m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  console.log(`User ${userAddress.toString()} `);
  console.log(`In-Flow  ${user.inStream.flow.toString()} units/s, `);
  console.log(`Out-Flow  ${user.outStream.flow.toString()} units/s`);
  console.log(`Deposit ${user.deposit.amount.toString()}  units`);
  console.log(`TimeStamp ${user.timestamp.toString()}  units`);
  console.log(`Cumulative Yield: ${user.cumulatedYield.toString()}  units`);
  console.log('\x1b[32m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  return user;
};

export function matchEvent(receipt: TransactionReceipt, name: string, eventContract: Contract, expectedArgs?: any[]): void {
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
              if (matchRecursiveArray(expected, params) == true) {
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

function matchRecursiveArray(expected: Array<any>, params: Array<any>) {
  let invalidParamsButExists = false;
  for (let j = 0; j < params.length; j++) {
    if (BigNumber.isBigNumber(params[j])) {
      if (!params[j].eq(BigNumber.from(expected[j]))) {
        return (invalidParamsButExists = true);
      }
    } else if (params[j].constructor == Array) {
      let paramsRec = params[j];
      let expectedRec = expected[j];
      if (matchRecursiveArray(expectedRec, paramsRec) == true) {
        invalidParamsButExists = true;
        return invalidParamsButExists;
      }
    } else if (params[j] != expected[j]) {
      invalidParamsButExists = true;
      return true;
    }
  }
  return invalidParamsButExists;
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
          blockNumber: 26376362,
        },
      },
    ],
  });
}
