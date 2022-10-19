import { useReactiveVar } from '@apollo/client';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { Framework } from '@superfluid-finance/sdk-core';

import { BigNumber, constants, Contract, utils } from 'ethers';

import { waitForTx } from '../../helpers/utils';
import { ERC20, ISuperToken, ISuperfluidToken } from '../../typechain-types';
import { getGelatoWithdrawStepId } from './gelato-V2';
import { IPOOL, IPOOLS_RESULT, IPOOL_RESULT, IUSERS_TEST, IUSERTEST, SupplierEvent } from './models-V2';
import { printPoolResult, printUserResult } from './utils-V2';

export const updatePool = (lastPool: IPOOL_RESULT, timestamp: BigNumber, yieldAccrued: BigNumber, yieldSnapshot: BigNumber, PRECISSION: BigNumber): IPOOL_RESULT => {
  let pool: IPOOL_RESULT = Object.assign({}, lastPool);
  let peridodSpan = timestamp.sub(lastPool.timestamp);
  //// dollarSecond

  pool.poolTotalBalance = pool.poolTotalBalance.add(yieldAccrued);

  let depositSeconds = lastPool.deposit.mul(peridodSpan);

  let flowSeconds = lastPool.depositFromInFlowRate.mul(peridodSpan).add(lastPool.inFlowRate.mul(peridodSpan).mul(peridodSpan).mul(PRECISSION).div(2));

  let totalSeconds = depositSeconds.add(flowSeconds);

  let inFlowContribution = flowSeconds.mul(PRECISSION);
  let depositContribution = depositSeconds.mul(PRECISSION).mul(PRECISSION);

  let indexDeposit = +depositSeconds == 0 ? 0 : depositContribution.mul(yieldAccrued).div(totalSeconds.mul(lastPool.deposit));
  let indexFlow = +flowSeconds == 0 ? 0 : inFlowContribution.mul(yieldAccrued).div(lastPool.inFlowRate.mul(totalSeconds));

  pool.depositFromInFlowRate = lastPool.depositFromInFlowRate.add(lastPool.inFlowRate.mul(peridodSpan).mul(PRECISSION));

  pool.yieldTokenIndex = lastPool.yieldTokenIndex.add(indexDeposit);
  pool.yieldInFlowRateIndex = lastPool.yieldInFlowRateIndex.add(indexFlow);

  pool.id = lastPool.id.add(BigNumber.from(1));
  pool.timestamp = timestamp;

  pool.yieldAccrued = yieldAccrued;
  pool.totalYield = lastPool.totalYield.add(yieldAccrued);
  pool.yieldSnapshot = yieldSnapshot;

  if (pool.inFlowRate > BigNumber.from(0)) {
    pool.poolTotalBalance = pool.poolTotalBalance.add(peridodSpan.mul(pool.inFlowRate));
  }

  if (pool.outFlowRate > BigNumber.from(0)) {
    pool.poolTotalBalance = pool.poolTotalBalance.sub(peridodSpan.mul(pool.outFlowRate));
  }

  pool.apySpan = lastPool.apySpan.add(peridodSpan);

  return pool;
};

export const applyUserEvent = async (
  code: SupplierEvent,
  userAddress: string,
  payload: string,
  usersPool: { [key: string]: IUSERTEST },
  pool: IPOOL_RESULT,
  lastPool: IPOOL_RESULT,
  pools: { [key: number]: IPOOL_RESULT },
  PRECISSION: BigNumber,
  sf: Framework,
  superToken: string,
  deployer: SignerWithAddress,
  superPoolAddress: string
): Promise<[IUSERS_TEST, IPOOL_RESULT]> => {
  let abiCoder = new utils.AbiCoder();
  let result;
  let stepTime;
  let stepAmount;
  let minimalBalance;
  let oldFlow;
  let alreadyStreamed;
  let oldminiminal;
  pools[+pool.timestamp] = pool;

  let activeUser: IUSERTEST = usersPool[userAddress];

  let nonActiveUsers: IUSERS_TEST = Object.assign({}, usersPool);

  if (activeUser !== undefined) {
    // if (activeUser.expected.timestamp !== pool.timestamp) {
    [activeUser, pool] = await updateUser(activeUser, pool, lastPool, pools, PRECISSION, sf, superToken, deployer, superPoolAddress);
    // }
    delete nonActiveUsers[activeUser.address];
  }
  let rec;
  if (code == SupplierEvent.TRANSFER) {
    result = abiCoder.decode(['address','uint256'], payload);
     rec = usersPool[result[0]]
    delete nonActiveUsers[rec.address];
    [rec, pool] = await updateUser(rec, pool, lastPool, pools, PRECISSION, sf, superToken, deployer, superPoolAddress);
 

  }

  let users = await updateNonActiveUsers(nonActiveUsers, pool, lastPool, pools, PRECISSION, sf, superToken, deployer, superPoolAddress);
  if (activeUser !== undefined) {
    users[activeUser.address] = activeUser;
  }

  if (code == SupplierEvent.TRANSFER && rec != undefined){
      users[rec.address] = rec;
  }

  switch (code) {
    case SupplierEvent.DEPOSIT:
      console.log('depositio');
      result = abiCoder.decode(['uint256'], payload);
      pool.deposit = pool.deposit.add(result[0].mul(PRECISSION));
      pool.poolTotalBalance = pool.poolTotalBalance.add(result[0]);
      users[activeUser.address].expected.deposit = users[activeUser.address].expected.deposit.add(result[0].mul(PRECISSION));
      users[activeUser.address].expected.realTimeBalance = users[activeUser.address].expected.realTimeBalance.add(result[0]);
      users[activeUser.address].expected.tokenBalance = users[activeUser.address].expected.tokenBalance.sub(result[0]);

      break;
    case SupplierEvent.WITHDRAW:
      console.log('withdrawio');
      result = abiCoder.decode(['uint256'], payload);
      pool.deposit = pool.deposit.sub(result[0].mul(PRECISSION));
      pool.poolTotalBalance = pool.poolTotalBalance.sub(result[0]);
      users[activeUser.address].expected.deposit = users[activeUser.address].expected.deposit.sub(result[0].mul(PRECISSION));
      users[activeUser.address].expected.realTimeBalance = users[activeUser.address].expected.realTimeBalance.sub(result[0]);
      users[activeUser.address].expected.tokenBalance = users[activeUser.address].expected.tokenBalance.add(result[0]);
      break;

      case SupplierEvent.TRANSFER:
        console.log('transferio');
        result = abiCoder.decode(['address','uint256'], payload);

        users[activeUser.address].expected.deposit = users[activeUser.address].expected.deposit.sub(result[1].mul(PRECISSION));
        users[activeUser.address].expected.realTimeBalance = users[activeUser.address].expected.realTimeBalance.sub(result[1]);
  
        // [receiveUser , pool] = await updateUser( users[result[0]], pool, lastPool, pools, PRECISSION, sf, superToken, deployer, superPoolAddress);
        users[result[0]].expected.deposit =  users[result[0]].expected.deposit.add(result[1].mul(PRECISSION));
        users[result[0]].expected.realTimeBalance =  users[result[0]].expected.realTimeBalance.add(result[1]);
     
        break;
  


    case SupplierEvent.STREAM_START:
      console.log('streamio');
      result = abiCoder.decode(['int96'], payload);
      pool.inFlowRate = pool.inFlowRate.add(result[0]);
      users[activeUser.address].expected.inFlow = users[activeUser.address].expected.inFlow.add(result[0]);
      let deposit = await getDeposit(activeUser.address, sf, superToken, deployer, superPoolAddress);
      users[activeUser.address].expected.inFlowDeposit = deposit;
      users[activeUser.address].expected.tokenBalance = users[activeUser.address].expected.tokenBalance.sub(deposit);
      break;
    case SupplierEvent.STREAM_STOP:
      console.log('streamstoio');
      result = abiCoder.decode(['int96'], payload);
      pool.inFlowRate = pool.inFlowRate.sub(result[0]);
      users[activeUser.address].expected.inFlow = users[activeUser.address].expected.inFlow.sub(result[0]);
      users[activeUser.address].expected.tokenBalance = users[activeUser.address].expected.tokenBalance.add(users[activeUser.address].expected.inFlowDeposit);
      break;

    case SupplierEvent.OUT_STREAM_START:
      console.log('out_streamio');
      result = abiCoder.decode(['int96'], payload);
      users[activeUser.address].expected.outFlow = users[activeUser.address].expected.outFlow.add(result[0]);

      stepTime = users[activeUser.address].expected.realTimeBalance.div(BigNumber.from(10)).div(result[0]);
      stepAmount = users[activeUser.address].expected.outFlow.mul(stepTime);

      minimalBalance = BigNumber.from(5 * 3600)
        .mul(result[0])
        .add(stepAmount);

      users[activeUser.address].expected.outMinBalance = minimalBalance;
      users[activeUser.address].expected.outStepAmount = stepAmount;
      users[activeUser.address].expected.outStepTime = stepTime;
      users[activeUser.address].expected.outStreamInit = pool.timestamp;
      users[activeUser.address].expected.outStreamCreated = pool.timestamp;
      users[activeUser.address].expected.nextExecOut = pool.timestamp.add(stepTime);
      users[activeUser.address].expected.deposit = users[activeUser.address].expected.deposit.sub(minimalBalance.mul(PRECISSION));
      users[activeUser.address].expected.realTimeBalance = users[activeUser.address].expected.deposit.add(minimalBalance.mul(PRECISSION)).div(PRECISSION);
      pool.deposit = pool.deposit.sub(minimalBalance.mul(PRECISSION));
      pool.outFlowRate = pool.outFlowRate.add(result[0]);

      pool.outFlowBuffer = pool.outFlowBuffer.add(minimalBalance);

      break;

    case SupplierEvent.OUT_STREAM_UPDATE:
      console.log('out_streamio_stop');
      result = abiCoder.decode(['int96'], payload);
      oldFlow = users[activeUser.address].expected.outFlow;

      alreadyStreamed = pool.timestamp.sub(users[activeUser.address].expected.outStreamInit).mul(oldFlow);

      oldminiminal = users[activeUser.address].expected.outMinBalance;
      users[activeUser.address].expected.outFlow = result[0];
      pool.outFlowRate = pool.outFlowRate.add(result[0]).sub(oldFlow);
      stepTime = users[activeUser.address].expected.realTimeBalance.div(BigNumber.from(10)).div(result[0]);
      stepAmount = users[activeUser.address].expected.outFlow.mul(stepTime);

      minimalBalance = BigNumber.from(5 * 3600)
        .mul(result[0])
        .add(stepAmount);

      users[activeUser.address].expected.outMinBalance = minimalBalance;
      users[activeUser.address].expected.outStepAmount = stepAmount;
      users[activeUser.address].expected.outStepTime = stepTime;
      users[activeUser.address].expected.outStreamInit = pool.timestamp;
      users[activeUser.address].expected.outStreamCreated = pool.timestamp;
      users[activeUser.address].expected.nextExecOut = pool.timestamp.add(stepTime);
      users[activeUser.address].expected.deposit = users[activeUser.address].expected.deposit
        .sub(minimalBalance.mul(PRECISSION))
        .add(oldminiminal.mul(PRECISSION))
        .sub(alreadyStreamed.mul(PRECISSION));
      users[activeUser.address].expected.realTimeBalance = users[activeUser.address].expected.deposit.add(minimalBalance.mul(PRECISSION)).div(PRECISSION);

      pool.deposit = pool.deposit.sub(minimalBalance.mul(PRECISSION)).add(oldminiminal.mul(PRECISSION)).sub(alreadyStreamed.mul(PRECISSION));
      pool.outFlowBuffer = pool.outFlowBuffer.add(minimalBalance).sub(oldminiminal);

      break;

    case SupplierEvent.OUT_STREAM_STOP:
      console.log('out_streamio');
      result = abiCoder.decode(['int96'], payload);
      oldFlow = users[activeUser.address].expected.outFlow;

      alreadyStreamed = pool.timestamp.sub(users[activeUser.address].expected.outStreamInit).mul(oldFlow);

      oldminiminal = users[activeUser.address].expected.outMinBalance;
      users[activeUser.address].expected.outFlow = result[0];
      pool.outFlowRate = pool.outFlowRate.sub(oldFlow);

      users[activeUser.address].expected.outMinBalance = BigNumber.from(0);
      users[activeUser.address].expected.outStepAmount = BigNumber.from(0);
      users[activeUser.address].expected.outFlow = BigNumber.from(0);
      users[activeUser.address].expected.outStepTime = BigNumber.from(0);
      users[activeUser.address].expected.outStreamInit = BigNumber.from(0);
      users[activeUser.address].expected.outStreamCreated = BigNumber.from(0);
      users[activeUser.address].expected.outStreamId = '0x0000000000000000000000000000000000000000000000000000000000000000';
      users[activeUser.address].expected.nextExecOut = BigNumber.from(0);
      users[activeUser.address].expected.deposit = users[activeUser.address].expected.deposit.add(oldminiminal.mul(PRECISSION)).sub(alreadyStreamed.mul(PRECISSION));
      users[activeUser.address].expected.realTimeBalance = users[activeUser.address].expected.deposit.div(PRECISSION);

      pool.deposit = pool.deposit.add(oldminiminal.mul(PRECISSION)).sub(alreadyStreamed.mul(PRECISSION));
      pool.outFlowBuffer = pool.outFlowBuffer.sub(oldminiminal);

      break;

    case SupplierEvent.PUSH_TO_STRATEGY:
      console.log('pushio');
      result = abiCoder.decode(['uint256'], payload);
   
      pool.yieldSnapshot = pool.yieldSnapshot.add(result[0]);
      break;

    case SupplierEvent.WITHDRAW_STEP:
      console.log('STEPIO');
      // pool.deposit = pool.deposit.sub(users[activeUser.address].expected.outStepAmount.mul(PRECISSION));

      if (users[activeUser.address].expected.realTimeBalance.lt(users[activeUser.address].expected.outMinBalance)) {
        pool.outFlowRate = pool.outFlowRate.sub(users[activeUser.address].expected.outFlow);
        pool.deposit = pool.deposit.sub(users[activeUser.address].expected.realTimeBalance.mul(PRECISSION));
        users[activeUser.address].expected.tokenBalance= users[activeUser.address].expected.tokenBalance.add((users[activeUser.address].expected.realTimeBalance))

        pool.outFlowBuffer = pool.outFlowBuffer.sub(users[activeUser.address].expected.outMinBalance);
        users[activeUser.address].expected.tokenBalance = users[activeUser.address].expected.tokenBalance.add(users[activeUser.address].expected.realTimeBalance);
        users[activeUser.address].expected.outMinBalance = BigNumber.from(0);
        users[activeUser.address].expected.outStepAmount = BigNumber.from(0);
        users[activeUser.address].expected.outFlow = BigNumber.from(0);
        users[activeUser.address].expected.outStepTime = BigNumber.from(0);
        users[activeUser.address].expected.outStreamInit = BigNumber.from(0);
        users[activeUser.address].expected.outStreamCreated = BigNumber.from(0);
        users[activeUser.address].expected.outStreamId = '0x0000000000000000000000000000000000000000000000000000000000000000';
        users[activeUser.address].expected.nextExecOut = BigNumber.from(0);
        users[activeUser.address].expected.deposit = BigNumber.from(0);
        users[activeUser.address].expected.realTimeBalance = BigNumber.from(0);
           } else {
        let amountStep = users[activeUser.address].expected.outFlow.mul(users[activeUser.address].expected.outStepTime);

        pool.deposit = pool.deposit.sub(amountStep.mul(PRECISSION));

        users[activeUser.address].expected.deposit = users[activeUser.address].expected.deposit.sub(amountStep.mul(PRECISSION));
        users[activeUser.address].expected.nextExecOut = users[activeUser.address].expected.nextExecOut.add(users[activeUser.address].expected.outStepTime);
        users[activeUser.address].expected.outStreamInit = pool.timestamp;
        pool.yieldSnapshot = pool.yieldSnapshot.sub(amountStep);
      }
      break;

    default:
      break;
  }

  // Object.keys(users).forEach((key) => {
  //   printUserResult(users[key]);
  // });

  // printPoolResult(pool);

  return [users, pool];
};

export const getUserYield = (user: IUSERTEST, pool: IPOOL_RESULT, pools: IPOOLS_RESULT) => {
  let yieldDeposit = user.expected.deposit.mul(pool.yieldTokenIndex.sub(pools[+user.expected.timestamp].yieldTokenIndex));
  let yieldFlow = user.expected.inFlow.mul(pool.yieldInFlowRateIndex.sub(pools[+user.expected.timestamp].yieldInFlowRateIndex));

  return [yieldDeposit, yieldFlow];
};

export const updateUser = async (
  user: IUSERTEST,
  pool: IPOOL_RESULT,
  lastPool: IPOOL_RESULT,
  pools: { [key: number]: IPOOL_RESULT },
  PRECISSION: BigNumber,
  sf: Framework,
  superToken: string,
  deployer: SignerWithAddress,
  superPoolAddress: string
): Promise<[IUSERTEST, IPOOL_RESULT]> => {
  let increment = BigNumber.from(0);
  let decrementToken = BigNumber.from(0);
  let decrement = BigNumber.from(0);
  let incrementToken = BigNumber.from(0);
  let yieldArray = getUserYield(user, pool, pools);
  let yieldDeposit = yieldArray[0].div(PRECISSION);
  let yieldFlow = yieldArray[1];
  let yieldUser = yieldDeposit.add(yieldFlow);

  if (+user.expected.inFlow > 0) {
    increment = user.expected.inFlow.mul(pool.timestamp.sub(user.expected.timestamp));
    // deposit = await getDeposit(user.address,sf,superToken,deployer,superPoolAddress)
    decrementToken = user.expected.inFlow.mul(pool.timestamp.sub(lastPool.timestamp));
    user.expected.deposit = user.expected.deposit.add(increment.mul(PRECISSION));
  }

  user.expected.deposit = user.expected.deposit.add(yieldUser);
  user.expected.realTimeBalance = user.expected.deposit;
  if (+user.expected.outFlow > 0) {
    decrement = user.expected.outFlow.mul(pool.timestamp.sub(user.expected.outStreamInit));
    // deposit = await getDeposit(user.address,sf,superToken,deployer,superPoolAddress)
    incrementToken = user.expected.outFlow.mul(pool.timestamp.sub(lastPool.timestamp));
    user.expected.realTimeBalance = user.expected.realTimeBalance.add(user.expected.outMinBalance.mul(PRECISSION)).sub(decrement.mul(PRECISSION));
  }

  user.expected.tokenBalance = user.expected.tokenBalance.sub(decrementToken).add(incrementToken);
  user.expected.realTimeBalance = user.expected.realTimeBalance.div(PRECISSION);
  user.expected.timestamp = pool.timestamp;

  pool.depositFromInFlowRate = pool.depositFromInFlowRate.sub(increment.mul(PRECISSION));
  pool.deposit = pool.deposit.add(yieldUser).add(increment.mul(PRECISSION));

  return [user, pool];
};

export const updateNonActiveUsers = async (
  users: IUSERS_TEST,
  pool: IPOOL_RESULT,
  lastPool: IPOOL_RESULT,
  pools: { [key: number]: IPOOL_RESULT },
  PRECISSION: BigNumber,
  sf: Framework,
  superToken: string,
  deployer: SignerWithAddress,
  superPoolAddress: string
) => {
  let keys = Object.keys(users);
  for (const key of keys) {
    let user = users[key];

    let yieldArray = getUserYield(user, pool, pools);
    let yieldDeposit = yieldArray[0].div(PRECISSION);
    let yieldFlow = yieldArray[1];
    let yieldUser = yieldDeposit.add(yieldFlow);
    let deposit = BigNumber.from(0);
    let increment = BigNumber.from(0);
    let decrementToken = BigNumber.from(0);
    let decrement = BigNumber.from(0);
    let incrementToken = BigNumber.from(0);
    if (+user.expected.inFlow > 0) {
      increment = user.expected.inFlow.mul(pool.timestamp.sub(user.expected.timestamp));
      decrementToken = user.expected.inFlow.mul(pool.timestamp.sub(lastPool.timestamp));
      //  deposit = await getDeposit(user.address,sf,superToken,deployer,superPoolAddress)
    }

    if (+user.expected.outFlow > 0) {
      decrement = user.expected.outFlow.mul(pool.timestamp.sub(user.expected.timestamp));
      // deposit = await getDeposit(user.address,sf,superToken,deployer,superPoolAddress)
      incrementToken = user.expected.outFlow.mul(pool.timestamp.sub(lastPool.timestamp));
    }
    user.expected.tokenBalance = user.expected.tokenBalance.sub(decrementToken).add(incrementToken);

    user.expected.realTimeBalance = user.expected.deposit
      .add(user.expected.outMinBalance.mul(PRECISSION))
      .add(yieldUser)
      .add(increment.mul(PRECISSION))
      .sub(decrement.mul(PRECISSION))
      .div(PRECISSION);
  }

  return users;
};

export const faucet = async (user: SignerWithAddress, tokenContract: ERC20, superTOkenContract: ISuperToken) => {
  let amount = 10000 * 10 ** 6;

  let amountSuper = utils.parseEther('1000');
  await waitForTx((tokenContract as Contract).connect(user)['mint(address,uint256)'](user.address,amountSuper));

  await waitForTx((tokenContract as Contract).connect(user).approve(superTOkenContract?.address, constants.MaxUint256));

  await waitForTx((superTOkenContract as ISuperToken).connect(user).upgrade(BigNumber.from(amountSuper)));
};

export const fromTokenToSuperToken = (value: BigNumber) => {
  return value.mul(BigNumber.from(10 ** 12));
};

export const fromSeperTokenToToken = (value: BigNumber) => {
  return value.div(BigNumber.from(10 ** 12));
};

export const getDeposit = async (user: string, sf: Framework, superToken: string, deployer: SignerWithAddress, superPoolAddress: string): Promise<BigNumber> => {
  let deposit = BigNumber.from(0);
  let fromUserStream = await sf.cfaV1.getFlow({
    superToken: superToken,
    sender: user,
    receiver: superPoolAddress,
    providerOrSigner: deployer,
  });

  return (deposit = BigNumber.from('0x' + (+fromUserStream.deposit).toString(16)));
};
