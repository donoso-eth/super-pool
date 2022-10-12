import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { utils } from "ethers";
import { IOps, PoolStrategyV2 } from "../../typechain-types";


export const gelatoPushToAave = async (poolStrategy: PoolStrategyV2, ops:IOps, executor:SignerWithAddress) => {
    
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    const resolverData =  poolStrategy.interface.encodeFunctionData("checkerDeposit");
    const resolverArgs = utils.defaultAbiCoder.encode(
      ["address", "bytes"],
      [poolStrategy.address, resolverData]
    );

   let  execSelector =  poolStrategy.interface.getSighash("depositTask");
    let moduleData = {
      modules: [0],
      args: [resolverArgs],
    };

    const FEE = utils.parseEther("0.1")

    const [, execData] = await poolStrategy.checkerDeposit();

    await ops
      .connect(executor)
      .exec(
        poolStrategy.address,
        poolStrategy.address,
        execData,
        moduleData,
        FEE,
        ETH,
        false,
        true
      );

}