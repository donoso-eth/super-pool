import { BigNumber, Contract, logger, utils } from 'ethers';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { hexlify, keccak256, RLP, toUtf8Bytes } from 'ethers/lib/utils';
import { Network } from 'hardhat/types';
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { AllocationMock, ERC20, ERC777, IOps, ISuperfluidToken, PoolFactoryV1 } from '../../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

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
  deposit?: BigNumber;
  timestamp?: BigNumber;
  inFlow?:BigNumber;
  inFlowId?: string
  nextExecIn?:BigNumber
  outFlow?: BigNumber;
  outAssets?: BigNumber
  outAssetsId?: string
  nextExecOut?:BigNumber
}

export interface IUSERTEST {address:string, name: string,expected: IUSER_RESULT}

export const testPeriod = async (
    t0:BigNumber,
    tx:number,
    expected:IPERIOD_RESULT,    
     contracts: {
      poolAddress: string,
       superTokenContract: ISuperfluidToken, 
       superTokenPool:PoolFactoryV1,
       tokenContract: ERC777,
       ops?:IOps
      },
      users:Array<IUSERTEST>,
      
      ) => {
 
  // #region POOL      

  let poolTotalBalance = await contracts.superTokenContract.realtimeBalanceOfNow(contracts.poolAddress);

  let result: IPERIOD = await getPool(contracts.superTokenPool);
  
  if (poolTotalBalance.availableBalance != undefined) {
    try {
      expect(poolTotalBalance.availableBalance).to.equal(expected.poolTotalBalance);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Pool Assets Balance: ${poolTotalBalance.availableBalance.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Pool Balance:', `\x1b[30m ${poolTotalBalance.availableBalance.toString()}, expected:${expected.poolTotalBalance!.toString()}`);
    }
  }

  
  if (expected.totalShares != undefined) {
    try {
      expect(result.totalShares).to.equal(expected.totalShares);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Pool Shares Balance: ${result.totalShares.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Pool Shares:', `\x1b[30m ${result.totalShares.toString()}, expected:${expected.totalShares!.toString()}`);
    }
  }


  if (expected.deposit != undefined) {
    try {
      expect(result.deposit).to.equal(expected.deposit);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Deposit: ${result.deposit.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Deposit:', `\x1b[30m ${result.deposit.toString()}, expected:${expected.deposit!.toString()}`);
    }
  }

  if (expected.depositFromOutFlowRate != undefined) {
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

  if (expected.depositFromInFlowRate != undefined) {
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

  if (expected.inFlowRate != undefined) {
    try {
      expect(result.inFlowRate).to.equal(expected.inFlowRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#In-Flow Rate: ${result.inFlowRate.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #In-Flow Rate:', `\x1b[30m ${result.inFlowRate.toString()}, expected:${expected.inFlowRate!.toString()}`);
    }
  }

  if (expected.outFlowRate != undefined) {
    try {
      expect(result.outFlowRate).to.equal(expected.outFlowRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Out-Flow Rate: ${result.outFlowRate.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Out-Flow Rate:', `\x1b[30m ${result.outFlowRate.toString()}, expected:${expected.outFlowRate!.toString()}`);
    }
  }

 
  if (expected.outFlowAssetsRate != undefined) {
    try {
      expect(result.outFlowAssetsRate).to.equal(expected.outFlowAssetsRate);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Out-Flow-ASSETS Rate: ${result.outFlowAssetsRate?.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Out-Flow-ASSETS Rate:', `\x1b[30m ${result.outFlowAssetsRate?.toString()}, expected:${expected.outFlowAssetsRate!.toString()}`);
    }
  }


  if (expected.yieldAccruedSec != undefined) {
    expect(result.yieldAccruedSec).to.equal(expected.yieldAccruedSec);
    console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Yield accrued per sec: ${result.yieldAccruedSec.toString()}`);
  }

  if (expected.yieldTokenIndex != undefined) {
    try {
      expect(result.yieldTokenIndex).to.equal(expected.yieldTokenIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield Token: ${result.yieldTokenIndex.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Index Yield Token: ${result.yieldTokenIndex.toString()}, expected:${expected.yieldTokenIndex!.toString()}`);
    }
  }

  if (expected.yieldInFlowRateIndex != undefined) {
    try {
      expect(result.yieldInFlowRateIndex).to.equal(expected.yieldInFlowRateIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield In-FLOW : ${result.yieldInFlowRateIndex.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Index Yield In-FLOW: ${result.yieldInFlowRateIndex.toString()}, expected:${expected.yieldInFlowRateIndex!.toString()}`);
    }
  }

  if (expected.yieldOutFlowRateIndex != undefined) {
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

  // #endregion POOL      


  for (const user of users) {

  let userRealtimeBalance = await contracts.superTokenPool.totalBalanceSupplier(user.address);
  let userShares = await contracts.superTokenPool.balanceOf(user.address);
  let userTokenBalance = await contracts.tokenContract.balanceOf(user.address);
  let userState = await contracts.superTokenPool.suppliersByAddress(user.address);
  let periodSpan = BigNumber.from(tx).sub(userState.timestamp.sub(t0));

  console.log('\x1b[35m%s\x1b[0m', '     ==================================', );

  if (user.expected.realTimeBalance != undefined) {
    try {
      expect(userRealtimeBalance ).to.equal(user.expected.realTimeBalance);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Balance Assets: ${user.expected.realTimeBalance?.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} Balance Assets: ${userRealtimeBalance.toString()}, expected:${user.expected.realTimeBalance!.toString()}`
      );
      console.log(+userRealtimeBalance.toString()-+user.expected.realTimeBalance!.toString())
    }
  }
  if (userShares != undefined) {
    try {
      expect(userShares).to.equal(user.expected.shares);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Shares: ${user.expected.shares?.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} Shares : ${userShares.toString()}, expected:${user.expected.shares!.toString()}`
      );
      console.log(+userShares.toString()-+user.expected.shares!.toString())
    }

  }

  if (userTokenBalance != undefined) {
    try {
      expect(userTokenBalance).to.equal(user.expected.tokenBalance);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Token Balance : ${user.expected.tokenBalance?.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} Token Balance : ${userTokenBalance.toString()}, expected:${user.expected.tokenBalance!.toString()}`
      );
      console.log(+userTokenBalance.toString()-+user.expected.tokenBalance!.toString())
    }
  }



  if (user.expected.deposit != undefined) {
    let depositOutFlow = userState.deposit.amount.sub(periodSpan.mul(userState.outAssets.flow).mul(1000000))
    
    try {
       expect(user.expected.deposit).to.equal(depositOutFlow );
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Deposit: ${depositOutFlow ?.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} Deposit : ${depositOutFlow !.toString()}, expected:${user.expected.deposit.toString()}`
      );
      console.log(+user.expected.deposit.toString()-+userState.deposit.amount!.toString())
    }
  }


  if (user.expected.inFlow != undefined) {
    try {
      expect(user.expected.inFlow).to.equal(userState.inStream.flow);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} IN-FLOW: ${userState.inStream.flow?.toString()} units/s`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} IN-FLOW:  ${userState.inStream.flow.toString()},  ${user.expected.inFlow.toString()} expected: units/s`
      );
      console.log(+user.expected.inFlow.toString()-+userState.inStream.flow.toString())
    }
  }

  if (user.expected.inFlowId != undefined) {
    try {
      expect(user.expected.inFlowId ).to.equal(userState.inStream.cancelTaskId);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} INFLOW -TaskId: ${userState.inStream.cancelTaskId?.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} INFLOW -TaskId:  ${userState.inStream.cancelTaskId.toString()}, expected: ${user.expected.inFlowId.toString()}`
      );
    
    }
  }


  
  if (user.expected.nextExecIn != undefined) {
    let nextExec =  (await contracts.ops?.timedTask(userState.inStream.cancelTaskId))?.nextExec as BigNumber;
    
    try {

      
      //console.log(+timed['nextExec'].toString())
    
      expect(user.expected.nextExecIn).to.equal(nextExec);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Gelato Task Next Execution Inflow: ${nextExec.sub(t0).sub(BigNumber.from(tx)).toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} Gelato Task Next Execution Inflow:  ${nextExec.toString()}, expected: ${user.expected.nextExecIn.toString()}`
      );
      console.log(+nextExec.toString()-+user.expected.nextExecIn.toString())
    }
  }


  if (user.expected.outFlow != undefined) {
    try {
      expect(user.expected.outFlow).to.equal(userState.outStream.flow);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} OUT-FLOW: ${userState.outStream.flow?.toString()} units/s`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} OUT-FLOW: ${userState.outStream.flow.toString()} , expected: ${user.expected.outFlow.toString()} units/s`
      );
      console.log(+user.expected.outFlow.toString()-+userState.outStream.flow.toString())
    }
  }


  if (user.expected.outAssets != undefined) {
    try {
      expect(user.expected.outAssets).to.equal(userState.outAssets.flow);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} OUT-Assets: ${userState.outAssets.flow?.toString()} units/s`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} OUT-Assets:  ${userState.outAssets.flow.toString()}, expected: ${user.expected.outAssets.toString()} units/s`
      );
      console.log(+user.expected.outAssets.toString()-+userState.outAssets.flow.toString())
    }
  }

  if (user.expected.outAssetsId != undefined) {
    try {
      expect(user.expected.outAssetsId ).to.equal(userState.outAssets.cancelTaskId);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} OUT-Assets-TaskId: ${userState.outAssets.cancelTaskId?.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} OUT-Assets-TaskId:  ${userState.outAssets.cancelTaskId.toString()}, expected: ${user.expected.outAssetsId.toString()}`
      );
    
    }
  }


  
  if (user.expected.nextExecOut != undefined) {
    let nextExec =  (await contracts.ops?.timedTask(userState.outAssets.cancelTaskId))?.nextExec as BigNumber;
    
    try {

      
      //console.log(+timed['nextExec'].toString())
      console.log((+await getTimestamp()).toString())
      expect(user.expected.nextExecOut).to.equal(nextExec);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Gelato Task Next Execution OutFlow: ${nextExec.sub(t0).sub(BigNumber.from(tx)).toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} Gelato Task Next Execution OutFlow:  ${nextExec.toString()}, expected: ${user.expected.nextExecOut.toString()}`
      );
      console.log(+nextExec.toString()-+user.expected.nextExecOut.toString())
    }
  }

  if (user.expected.timestamp != undefined) {
    let checkTimestamp = userState.timestamp.sub(t0);


    try {
      expect(user.expected.timestamp).to.equal(checkTimestamp);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} TimeStamp: ${checkTimestamp?.toString()} ms`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x',
        `\x1b[30m#${user.name} TimeStamp: ${checkTimestamp.toString()} , expected: ${user.expected.timestamp.toString()} ms`
      );
      console.log(+user.expected.timestamp.toString()-+checkTimestamp.toString())
    }
  }
  }

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

export const getPool = async (superTokenPool: PoolFactoryV1): Promise<any> => {
  let periodTimestamp = +(await superTokenPool.lastPoolTimestamp()).toString();
  let periodRaw = await superTokenPool.poolByTimestamp(periodTimestamp);

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


export interface IMOCK_RESULT {
  lastTimestamp: BigNumber;
  incrementStored: BigNumber;
  deposit?: BigNumber;
}


export const testMockStrategy = async (
  t0:BigNumber,
  tx:number,
  expected:IMOCK_RESULT,    
   contracts: {
    mockAllocation: AllocationMock,
    tokenContract: ERC20, 
    },
    deployer:SignerWithAddress
    
    ) => {

 

}


////// CONTRACTS

export const printPeriod = async (superTokenPool: PoolFactoryV1, t0: number): Promise<any> => {
  let periodTimestamp = +(await superTokenPool.lastPoolTimestamp()).toString();
  let period = await superTokenPool.poolByTimestamp(periodTimestamp);
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

export const printUser = async (superTokenPool: PoolFactoryV1, userAddress: string): Promise<any> => {
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
