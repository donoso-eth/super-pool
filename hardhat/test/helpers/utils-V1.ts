import { BigNumber, Contract, logger, utils } from 'ethers';
import { BaseProvider, TransactionReceipt } from '@ethersproject/providers';
import { hexlify, keccak256, RLP, toUtf8Bytes } from 'ethers/lib/utils';
import { Network } from 'hardhat/types';
import { ethers, network } from 'hardhat';
import { expect } from 'chai';
import { ERC20, IOps, ISuperfluidToken, PoolInternalV1, PoolV1,  } from '../../typechain-types';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { ICONTRACTS_TEST, IPOOL, IPOOL_RESULT, ITREASURY_RESULT, IUSERS_TEST, IUSERTEST, IUSER_CHECK } from './models-V1';
import { PoolV1StructOutput } from '../../typechain-types/IPoolV1';

export const fromBnToNumber = (x: BigNumber) => {
  return +x.toString();
};

export const testTreasury = async (timestamp:BigNumber, 
 expected: ITREASURY_RESULT, 
  contracts:ICONTRACTS_TEST) => {
  
  let yieldPool = await contracts.poolInternal.getLastPool();
  let yieldSnapshot = yieldPool.yieldObject.yieldSnapshot;

  let poolBalance = await contracts.superTokenContract.realtimeBalanceOfNow(contracts.poolAddress);
  let aaveBalance = (await contracts.aaveERC20.balanceOf(contracts.strategyAddresse));


  console.log('\x1b[31m%s\x1b[0m', '     =====   TREASURY   =============================');
  console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Timestamp ${timestamp.toString()}`);
  

  if (poolBalance != undefined) {
    try {
      if (+poolBalance.availableBalance.toString() == 0){
        expect((+poolBalance.availableBalance.toString() - +expected.superToken.toString())).to.eq(0);

      } else {
      expect(poolBalance.availableBalance).to.eq(expected.superToken);
      }
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#SuperToken Balance: ${poolBalance.availableBalance.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #SuperToken Balance:', `\x1b[30m ${poolBalance.availableBalance.toString()}, expected:${expected.superToken!.toString()}`);
      console.log(+poolBalance.availableBalance .toString() - +expected.superToken!.toString() )
    }
  }


  if (aaveBalance != undefined) {
    try {
      expect((+aaveBalance - +expected.aave)/+aaveBalance ).to.lt(0.000001);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Aave Balance: ${aaveBalance.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Aave Balance:', `\x1b[30m ${aaveBalance.toString()}, expected:${expected.aave!.toString()}`);
      console.log(+aaveBalance.toString() - +expected.aave!.toString() )
    }
  }


  if (expected.yieldSnapshot != undefined && !yieldSnapshot.isZero() ) {
    try {
      expect(expected.yieldSnapshot.sub(yieldSnapshot)).lt(5);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Yield Snapshot: ${expected.yieldSnapshot.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Yield Snapshot: ${yieldSnapshot.toString()}, expected:${(expected.yieldSnapshot)!.toString()}`);
    }
  }

  console.log('\x1b[32m%s\x1b[0m',  '    $', `\x1b[30m#Yield Pending: ${(aaveBalance.sub(expected.yieldSnapshot.div(10**12))).toString()}`);





}


export const testPeriod = async (t0: BigNumber, tx: number, expected: IPOOL_RESULT, contracts: ICONTRACTS_TEST, users: IUSERS_TEST) => {
  
  // #region POOL

  let poolBalance = await contracts.superTokenContract.realtimeBalanceOfNow(contracts.poolAddress);
  let aaveBalance = (await contracts.aaveERC20.balanceOf(contracts.strategyAddresse));

  let poolTotalBalance  = (poolBalance.availableBalance.div(10**12)).add(aaveBalance);

  console.log('\x1b[31m%s\x1b[0m', '     =====   POOL     =============================');
  let result: IPOOL = await getPool(contracts.poolInternal);

  if (expected.id != undefined) {
    try {
      expect(result.id).to.equal(expected.id);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#ID: ${result.id.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #ID:', `\x1b[30m ${result.id.toString()}, expected:${expected.id!.toString()}`);
    }
  }

  if (expected.timestamp != undefined) {
    try {
      expect(result.timestamp).to.equal(expected.timestamp);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Timestamp: ${result.timestamp.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Timestamp:', `\x1b[30m ${result.timestamp.toString()}, expected:${expected.timestamp!.toString()}`);
    }
  }

  if (poolTotalBalance != undefined) {
    try {
      expect((+poolTotalBalance - +expected.poolTotalBalance.div(10**12))/+poolTotalBalance ).to.lt(0.000001);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Pool Assets Balance: ${poolTotalBalance.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Pool Balance:', `\x1b[30m ${poolTotalBalance.toString()}, expected:${expected.poolTotalBalance.div(10**12)!.toString()}`);
      console.log(+poolTotalBalance.toString() - +expected.poolTotalBalance.div(10**12)!.toString() )
    }
  }
  
  if (poolBalance != undefined) {
    try {
      if (+poolBalance.availableBalance.toString() == 0){
        expect((+poolBalance.availableBalance.toString() - +expected.poolBalance.toString())).to.eq(0);

      } else {
      expect((+poolBalance.availableBalance.toString() - +expected.poolBalance.toString())/+poolBalance.availableBalance.toString() ).to.lt(0.000001);
      }
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#SuperToken Balance: ${poolBalance.availableBalance.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #SuperToken Balance:', `\x1b[30m ${poolBalance.availableBalance.toString()}, expected:${expected.poolBalance!.toString()}`);
      console.log(+poolBalance.availableBalance .toString() - +expected.poolBalance!.toString() )
    }
  }



  if (aaveBalance != undefined) {
    try {
      expect((+aaveBalance - +expected.aaveBalance)/+aaveBalance ).to.lt(0.000001);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Aave Balance: ${aaveBalance.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Aave Balance:', `\x1b[30m ${aaveBalance.toString()}, expected:${expected.aaveBalance!.toString()}`);
      console.log(+aaveBalance.toString() - +expected.aaveBalance!.toString() )
    }
  }

  if (expected.protocolYield != undefined &&  !expected.protocolYield.isZero()) {
    try {
      expect(+(result.yieldObject.protocolYield.sub(expected.protocolYield))/+result.yieldObject.protocolYield).to.lt(0.000001);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Protocol Yield: ${result.yieldObject.protocolYield.toString()}`);
    } catch (error) {
      console.log(
        '\x1b[31m%s\x1b[0m',
        '    x #Protocol Yield:',
        `\x1b[30m ${result.yieldObject.protocolYield.toString()}, expected:${expected.protocolYield!.toString()}`
      );
      }
    }


  if (expected.deposit != undefined) {
    try {
      expect(result.deposit).to.equal(expected.deposit);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Deposit: ${result.deposit.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Deposit:', `\x1b[30m ${result.deposit.toString()}, expected:${expected.deposit!.toString()}`);
      console.log(+expected.deposit.toString() - +result.deposit!.toString());

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




  if (expected.yieldTokenIndex != undefined) {
    try {
      expect(result.yieldObject.yieldTokenIndex).to.equal(expected.yieldTokenIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield Token: ${result.yieldObject.yieldTokenIndex.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Index Yield Token: ${result.yieldObject.yieldTokenIndex.toString()}, expected:${expected.yieldTokenIndex!.toString()}`);
    }
  }

  if (expected.yieldInFlowRateIndex != undefined) {
    try {
      expect(result.yieldObject.yieldInFlowRateIndex).to.equal(expected.yieldInFlowRateIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield In-FLOW : ${result.yieldObject.yieldInFlowRateIndex.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Index Yield In-FLOW: ${result.yieldObject.yieldInFlowRateIndex.toString()}, expected:${expected.yieldInFlowRateIndex!.toString()}`);
    }
  }

  if (expected.yieldOutFlowRateIndex != undefined) {
    try {
      expect(result.yieldObject.yieldOutFlowRateIndex).to.equal(expected.yieldOutFlowRateIndex);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Index Yield Out-FLOW : ${result.yieldObject.yieldOutFlowRateIndex.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Index Yield Out-FLOW: ${result.yieldObject.yieldOutFlowRateIndex.toString()}, expected:${expected.yieldOutFlowRateIndex!.toString()}`);
    }
  }


  if (expected.outFlowBuffer != undefined) {
    try {
      expect(result.outFlowBuffer).to.equal(expected.outFlowBuffer);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Out-Flow Buffer: ${result.outFlowBuffer.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x #Out-Flow Buffer: ', `\x1b[30m ${result.outFlowBuffer.toString()}, expected:${expected.outFlowBuffer.toString()}`);
    }
  }

  ///// YIELD PART

  if (expected.yieldAccrued != undefined && !expected.yieldAccrued.isZero()) {
    try {
      expect(+(result.yieldObject.yieldAccrued.sub(expected.yieldAccrued))/+result.yieldObject.yieldAccrued).to.lt(0.00001);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Yield accrued : ${result.yieldObject.yieldAccrued.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Yield Accrued: ${result.yieldObject.yieldAccrued.toString()}, expected:${expected.yieldAccrued!.toString()}`);
    }
  }

  if (expected.yieldSnapshot != undefined ) {
    try {
      expect(expected.yieldSnapshot.sub(result.yieldObject.yieldSnapshot)).lt(5);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Yield Snapshot: ${expected.yieldSnapshot.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Yield Snapshot: ${(result.yieldObject.yieldSnapshot)!.toString()}, expected: ${expected.yieldSnapshot.toString()}`);
      console.log(+result.yieldObject.yieldSnapshot.toString() - +expected.yieldSnapshot!.toString() )

    }
  }

  if (expected.totalYield != undefined && !expected.totalYield.isZero()) {
    try {
      expect(+(result.yieldObject.totalYield.sub(expected.totalYield))/(+result.yieldObject.totalYield)).lt(0.000001);
      console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#Total Yield : ${result.yieldObject.totalYield.toString()}`);
    } catch (error) {
      console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#Total Yield: ${result.yieldObject.totalYield.toString()}, expected:${expected.totalYield!.toString()}`);
    }
  }

  //// APY
  // if (expected.apy != undefined) {
  //   try {
  //     expect(result.apy.apy).to.equal(expected.apy);
  //     console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#ApY : ${result.apy.apy.toString()}`);
  //   } catch (error) {
  //     console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#APY: ${result.apy.apy.toString()}, expected:${expected.apy!.toString()}`);
  //   }
  // }

  // if (expected.apySpan != undefined) {
  //   try {
  //     expect(result.apy.span).to.equal(expected.apySpan);
  //     console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#ApY Span : ${result.apy.span.toString()}`);
  //   } catch (error) {
  //     console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#APY Span: ${result.apy.span.toString()}, expected:${expected.apySpan!.toString()}`);
  //   }
  //}

  console.log('\x1b[31m%s\x1b[0m', '     =====   USERS       =============================');

  // #endregion POOL
  let checkUsers = Object.keys(users).map(key=> users[key]).sort((a,b)=> +a.expected.id.sub(b.expected.id))
  for (const user of checkUsers ) {
    let userRealtimeBalance = await contracts.superPool.balanceOf(user.address);
    let userTokenBalance = await contracts.superTokenERC777.balanceOf(user.address);
    let userState = await contracts.poolInternal.suppliersByAddress(user.address);
    let periodSpan = BigNumber.from(tx).sub(userState.timestamp.sub(t0));


    console.log('\x1b[35m%s\x1b[0m', `     =====   ${user.name} =========================`);

    if (user.expected.id != undefined) {
      try {
        expect(userState.id).to.equal(user.expected.id);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} ID: ${user.expected.id?.toString()}`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} ID: ${userState.id.toString()}, expected:${user.expected.id!.toString()}`);
      }
    }

    if (user.expected.realTimeBalance != undefined) {
      try {
        expect(userRealtimeBalance).to.equal(user.expected.realTimeBalance);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Balance Assets: ${user.expected.realTimeBalance?.toString()}`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} Balance Assets: ${userRealtimeBalance.toString()}, expected:${user.expected.realTimeBalance!.toString()}`);
        console.log(+userRealtimeBalance.toString() - +user.expected.realTimeBalance!.toString());
      }
    }


    if (userTokenBalance != undefined) {
      try {
        expect(userTokenBalance).to.equal(user.expected.tokenBalance);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Token Balance : ${user.expected.tokenBalance?.toString()}`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} Token Balance : ${userTokenBalance.toString()}, expected:${user.expected.tokenBalance!.toString()}`);
        console.log(+userTokenBalance.toString() - +user.expected.tokenBalance!.toString());
      }
    }

    if (user.expected.deposit != undefined) {
      let depositOutFlow = userState.deposit.sub(periodSpan.mul(userState.outStream.flow).mul(1000000));

      try {
        expect(user.expected.deposit).to.equal(userState.deposit);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Deposit: ${userState.deposit.toString()}`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} Deposit : ${userState.deposit!.toString()}, expected:${user.expected.deposit.toString()}`);
        console.log(+user.expected.deposit.toString() - +userState.deposit!.toString());
      }
    }

    if (user.expected.inFlow != undefined) {
      try {
        expect(user.expected.inFlow).to.equal(userState.inStream);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} IN-FLOW: ${userState.inStream?.toString()} units/s`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} IN-FLOW:  ${userState.inStream.toString()},  ${user.expected.inFlow.toString()} expected: units/s`);
        console.log(+user.expected.inFlow.toString() - +userState.inStream.toString());
      }
    }




    if (user.expected.outFlow != undefined) {
      try {
        expect(user.expected.outFlow).to.equal(userState.outStream.flow);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} OUT-FLOW: ${userState.outStream.flow?.toString()} units/s`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} OUT-FLOW: ${userState.outStream.flow.toString()} , expected: ${user.expected.outFlow.toString()} units/s`);
        console.log(+user.expected.outFlow.toString() - +userState.outStream.flow.toString());
      }
    }



    if (user.expected.outStepTime != undefined) {
      try {
        expect(user.expected.outStepTime).to.equal(userState.outStream.streamDuration);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} STEP-TIME: ${userState.outStream.streamDuration?.toString()} units/s`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} STEP-TIME: ${userState.outStream.streamDuration.toString()} , expected: ${user.expected.outStepTime.toString()} units`);
        console.log('\x1b[31m%s\x1b[0m DIFFERENCE:', +user.expected.outStepTime.toString() - +userState.outStream.streamDuration.toString());
      }
    }




    if (user.expected.outStreamId != undefined) {
      try {
        expect(user.expected.outStreamId).to.equal(userState.outStream.cancelWithdrawId);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} OUT-Assets-TaskId: ${userState.outStream.cancelWithdrawId?.toString()}`);
      } catch (error) {
        console.log(
          '\x1b[31m%s\x1b[0m',
          '    x',
          `\x1b[30m#${user.name} OUT-Assets-TaskId:  ${userState.outStream.cancelWithdrawId.toString()}, expected: ${user.expected.outStreamId.toString()}`
        );
      }
    }

    if ( !user.expected.nextExecOut.eq(BigNumber.from(0) )) {
      let nextExec = (await contracts.ops?.timedTask(userState.outStream.cancelWithdrawId))?.nextExec as BigNumber;

      try {
        //console.log(+timed['nextExec'].toString())
        console.log((+(await getTimestamp())).toString());
        expect(user.expected.nextExecOut).to.equal(nextExec);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} Gelato Task Next Withdraw Step: ${nextExec}`);
      } catch (error) {
        console.log(
          '\x1b[31m%s\x1b[0m',
          '    x',
          `\x1b[30m#${user.name} Gelato Task Next  Withdraw Step:  ${nextExec.toString()}, expected: ${user.expected.nextExecOut.toString()}`
        );
        console.log(+nextExec.toString() - +user.expected.nextExecOut.toString());
      }
    }

    if (user.expected.timestamp != undefined) {
      let checkTimestamp = userState.timestamp;

      try {
        expect(user.expected.timestamp).to.equal(checkTimestamp);
        console.log('\x1b[32m%s\x1b[0m', '    ✔', `\x1b[30m#${user.name} TimeStamp: ${checkTimestamp?.toString()} ms`);
      } catch (error) {
        console.log('\x1b[31m%s\x1b[0m', '    x', `\x1b[30m#${user.name} TimeStamp: ${checkTimestamp.toString()} , expected: ${user.expected.timestamp.toString()} ms`);
        console.log(+user.expected.timestamp.toString() - +checkTimestamp.toString());
      }
    }
  }
};

export const getPool = async (poolInternal: PoolInternalV1): Promise<any> => {
  let periodTimestamp = +(await poolInternal.lastPoolTimestamp()).toString();
  let periodRaw = await poolInternal.poolByTimestamp(periodTimestamp);

  let pool: IPOOL = {
    id: periodRaw.id,
    timestamp: periodRaw.timestamp,
    deposit: periodRaw.deposit,
    inFlowRate: periodRaw.inFlowRate,
    outFlowRate: periodRaw.outFlowRate,
    outFlowBuffer: periodRaw.outFlowBuffer,
    depositFromInFlowRate: periodRaw.depositFromInFlowRate,
    depositFromOutFlowRate: periodRaw.depositFromOutFlowRate,
    yieldObject:periodRaw.yieldObject,
    apy: { span: periodRaw.apy.span, apy: periodRaw.apy.apy },
  };
  return pool;
};

////// CONTRACTS

export const addUser = (address: string, id: number, timestamp: BigNumber):IUSERTEST  => {
  return {
    name: 'User' + id.toString(),
    address: address,
    expected: {
      id: BigNumber.from(id),
      realTimeBalance: BigNumber.from(0),
      
      tokenBalance: utils.parseEther('1000'),
      deposit: BigNumber.from(0),
      outStepAmount:BigNumber.from(0),
      outStreamInit:  BigNumber.from(0),
      outStepTime: BigNumber.from(0),
      outMinBalance: BigNumber.from(0),
      outStreamCreated: BigNumber.from(0),
      outStreamId: "0x0000000000000000000000000000000000000000000000000000000000000000",
      nextExecOut:BigNumber.from(0),
      outFlow: BigNumber.from(0),
      inFlow: BigNumber.from(0),
      inFlowDeposit: BigNumber.from(0),
      timestamp: timestamp,
    },
  };
};

export const printPoolResult = async (pool: IPOOL_RESULT): Promise<any> => {
  console.log('\x1b[36m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXX   pool    XXXXXXXXXXXXXXXXXXXXX');
  console.log(`Id: ${+pool.id.toString()} `);
  console.log(`TimeStamp ${+pool.timestamp.toString()} `);
  console.log(`In-Flow ${pool.inFlowRate.toString()}  units/s`);
  console.log(`Out-Flow ${pool.outFlowRate.toString()}  units/s`);
  console.log(`Deposit From InFlow ${pool.depositFromInFlowRate.toString()}  units`);
  console.log(`Deposit ${pool.deposit.toString()}  units`);
  console.log(`IndexYieldToken: ${pool.yieldTokenIndex.toString()}  units`);
  console.log(`IndexYieldInFlowrate: ${pool.yieldInFlowRateIndex.toString()}  units`);
  console.log(`Yield Accrued: ${pool.yieldAccrued.toString()}  units`);
  console.log(`Yield Snapshot: ${pool.yieldSnapshot.toString()}  units`);
  console.log(`Yield totalYield: ${pool.totalYield.toString()}  units`);
  console.log('\x1b[36m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  return pool;
};

export const printUserResult = async (user: IUSERTEST): Promise<any> => {
  console.log('\x1b[32m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  console.log(`User ${user.address.toString()} `);
  console.log(`User ${user.name.toString()} `);
  console.log(`TimeStamp ${user.expected.timestamp.toString()}  units`);
  console.log(`RealtimeBalance: ${user.expected.realTimeBalance.toString()}  units`);
  console.log(`Deposit ${user.expected.deposit.toString()}  units`);
  console.log(`Token Balance: ${user.expected.tokenBalance.toString()}  units`);
  console.log(`In-Flow  ${user.expected.inFlow.toString()} units/s, `);
  console.log(`Out-Flow  ${user.expected.outFlow.toString()} units/s`);

  console.log('\x1b[32m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  return user;
};

export const printPool = async (poolInternal: PoolInternalV1, t0: number): Promise<any> => {
  let periodTimestamp = +(await poolInternal.lastPoolTimestamp()).toString();
  let period = await poolInternal.getPool(periodTimestamp);
  console.log(period.timestamp.toString());

  console.log('\x1b[36m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXX   PERIOD    XXXXXXXXXXXXXXXXXXXXX');
  console.log(`TimeStamp ${+period.timestamp.toString()} `);
  console.log(`In-Flow ${period.inFlowRate.toString()}  units/s`);
  console.log(`Out-Flow ${period.outFlowRate.toString()}  units/s`);
  console.log(`Deposit From InFlow ${period.depositFromInFlowRate.toString()}  units`);
  console.log(`Deposit ${period.deposit.toString()}  units`);
  console.log(`IndexYieldToken: ${period.yieldObject.yieldTokenIndex.toString()}  units`);
  console.log(`IndexYieldInFlowrate: ${period.yieldObject.yieldInFlowRateIndex.toString()}  units`);
  console.log(`Yield accrued: ${period.yieldObject.yieldAccrued.toString()}  units`);
  console.log(`Yield snapshot: ${period.yieldObject.yieldSnapshot.toString()}  units`);
  console.log('\x1b[36m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');

  return period;
};
 
export const printUser = async (superPool: PoolV1, userAddress: string): Promise<any> => {
  let user = await superPool.getSupplier(userAddress);

  console.log('\x1b[32m%s\x1b[0m', 'XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX');
  console.log(`User ${userAddress.toString()} `);
  console.log(`In-Flow  ${user.inStream.toString()} units/s, `);
  console.log(`Out-Flow  ${user.outStream.flow.toString()} units/s`);
  console.log(`Out-Flow  cancelID ${user.outStream.cancelWithdrawId.toString()} `);
  console.log(`Out-Flow Stem Time ${user.outStream.streamDuration.toString()} `);
  console.log(`Deposit ${user.deposit.toString()}  units`);
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
