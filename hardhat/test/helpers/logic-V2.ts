import { useReactiveVar } from '@apollo/client';
import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';

import { BigNumber, constants, Contract, utils } from 'ethers';

import { waitForTx } from '../../helpers/utils';
import { ERC20, ISuperToken, ISuperfluidToken } from '../../typechain-types';
import { IPOOL, IPOOLS_RESULT, IPOOL_RESULT, IUSERS_TEST, IUSERTEST, SupplierEvent } from './models-V2';
import { printPoolResult, printUserResult } from './utils-V2';

export const updatePool = (lastPool: IPOOL_RESULT, timestamp: BigNumber, yieldAccrued: BigNumber, PRECISSION: BigNumber): IPOOL_RESULT => {
  let pool: IPOOL_RESULT = Object.assign({}, lastPool);
  let peridodSpan = timestamp.sub(lastPool.timestamp);
  //// dollarSecond

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
  pool.yieldSnapshot = lastPool.yieldSnapshot.add(yieldAccrued);

  pool.apySpan = lastPool.apySpan.add(peridodSpan);

  return pool;
};

export const applyUserEvent = (
  code: SupplierEvent,
  userAddress: string,
  payload: string,
  usersPool: { [key: string]: IUSERTEST },
  pool: IPOOL_RESULT,
  pools: { [key: number]: IPOOL_RESULT },
  PRECISSION: BigNumber
): [IUSERS_TEST, IPOOL_RESULT] => {
  let abiCoder = new utils.AbiCoder();
  let result;

  let activeUser: IUSERTEST = usersPool[userAddress];

  let nonActiveUsers: IUSERS_TEST = Object.assign({}, usersPool);

  if (activeUser !== undefined) {
    if (activeUser.expected.timestamp !== pool.timestamp) {
      [activeUser, pool] = updateUser(activeUser, pool, pools, PRECISSION);
    }
    delete nonActiveUsers[activeUser.address];
  }

  let users = updateNonActiveUsers(nonActiveUsers, pool, pools, PRECISSION);
  if (activeUser !== undefined) {
    users[activeUser.address] = activeUser;
  }

  switch (code) {
    case SupplierEvent.DEPOSIT:
      console.log('depositio');
      result = abiCoder.decode(['uint256'], payload);
      pool.deposit = pool.deposit.add(result[0].mul(PRECISSION))
      console.log(result);
      break;
    case SupplierEvent.WITHDRAW:
      console.log('withdrawio');
      result = abiCoder.decode(['uint256'], payload);
     // pool.deposit = pool.deposit.sub(result[0].mul(PRECISSION))
      break;
    case SupplierEvent.STREAM_START:
      console.log('streamio');
      result = abiCoder.decode(['int96'], payload);
      pool.inFlowRate = pool.inFlowRate.add(result[0]);
      users[activeUser.address].expected.inFlow = users[activeUser.address].expected.inFlow.add(result[0]);
      break;
    case SupplierEvent.PUSH_TO_STRATEGY:
      console.log('pushio');
      result = abiCoder.decode(['uint256'], payload);
      console.log(result[0].toString());
     pool.yieldSnapshot = pool.yieldSnapshot.add(result[0]);
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

  return yieldDeposit.add(yieldFlow);
};

export const updateUser = (user: IUSERTEST, pool: IPOOL_RESULT, pools: { [key: number]: IPOOL_RESULT }, PRECISSION: BigNumber): [IUSERTEST, IPOOL_RESULT] => {
  let increment = BigNumber.from(0);
  if (+user.expected.inFlow > 0) {
    increment = user.expected.inFlow.mul(pool.timestamp.sub(user.expected.timestamp));
  }

  let yieldUser = getUserYield(user, pool, pools);
  user.expected.tokenBalance = user.expected.tokenBalance.sub(increment);

  user.expected.realTimeBalance = user.expected.deposit.add(yieldUser).div(PRECISSION).div(PRECISSION).add(increment);

  let poolIncrement = user.expected.realTimeBalance.sub(user.expected.deposit);
  user.expected.deposit = user.expected.realTimeBalance;
  user.expected.timestamp = pool.timestamp;

  pool.depositFromInFlowRate = pool.depositFromInFlowRate.sub(increment.mul(PRECISSION));
  pool.deposit = pool.deposit.add(yieldUser).add(increment.mul(PRECISSION));

  return [user, pool];
};

export const updateNonActiveUsers = (users: IUSERS_TEST, pool: IPOOL_RESULT, pools: { [key: number]: IPOOL_RESULT }, PRECISSION: BigNumber) => {
  Object.keys(users).forEach((key) => {
    let user = users[key];

    let yieldUser = getUserYield(user, pool, pools);

    let increment = BigNumber.from(0);
    if (+user.expected.inFlow > 0) {
      increment = user.expected.inFlow.mul(pool.timestamp.sub(user.expected.timestamp));
    }
    user.expected.tokenBalance = user.expected.tokenBalance.sub(increment);

    user.expected.realTimeBalance = user.expected.deposit.add(yieldUser.div(PRECISSION)).div(PRECISSION).add(increment);
  });

  return users;
};

export const faucet = async (user: SignerWithAddress, tokenContract: ERC20, superTOkenContract: ISuperToken) => {
  let amount = 10000 * 10 ** 6;

  let amountSuper = utils.parseEther('1000');
  await waitForTx((tokenContract as Contract).connect(user)['mint(uint256)'](amount));

  await waitForTx((tokenContract as Contract).connect(user).approve(superTOkenContract?.address, constants.MaxUint256));

  await waitForTx((superTOkenContract as ISuperToken).connect(user).upgrade(BigNumber.from(amountSuper)));
};

export const fromTokenToSuperToken = (value: BigNumber) => {
  return value.mul(BigNumber.from(10 ** 12));
};

export const fromSeperTokenToToken = (value: BigNumber) => {
  return value.div(BigNumber.from(10 ** 12));
};
