import { SignerWithAddress } from '@nomiclabs/hardhat-ethers/signers';
import { BigNumber, constants, Contract, utils } from 'ethers';
import { valueFromAST } from 'graphql';
import { waitForTx } from '../../helpers/utils';
import { ERC20, ISuperToken,ISuperfluidToken } from '../../typechain-types';

export const faucet = async (user: SignerWithAddress, tokenContract: ERC20, superTOkenContract: ISuperToken) => {
  let amount = 10000 * 10 ** 6;

  let amountSuper = utils.parseEther("1000")
  await waitForTx((tokenContract as Contract).connect(user)['mint(uint256)'](amount));

  await waitForTx((tokenContract as Contract).connect(user).approve(superTOkenContract?.address, constants.MaxUint256));

  await waitForTx((superTOkenContract as ISuperToken).connect(user).upgrade(BigNumber.from(amountSuper)));

};

export const fromTokenToSuperToken = (value:BigNumber) => {
    return value.mul(BigNumber.from(10**12))
};

export const fromSeperTokenToToken = (value:BigNumber) => {
    return value.div(BigNumber.from(10**12))
};