import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { utils } from "ethers";
import { PoolInternalV1 } from "../../typechain-types/PoolInternalV1";
import { PoolStrategyV1 } from "../../typechain-types/PoolStrategyV1";
import { PoolV1 } from "../../typechain-types/PoolV1";
import { IOps } from "../../typechain-types";


export const gelatoBalance= async (poolInternal: PoolInternalV1, ops:IOps, executor:SignerWithAddress) => {
    
    const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

    const resolverData =  poolInternal.interface.encodeFunctionData("checkerLastExecution");
    const resolverArgs = utils.defaultAbiCoder.encode(
      ["address", "bytes"],
      [poolInternal.address, resolverData]
    );

   let  execSelector =  poolInternal.interface.getSighash("balanceTreasury");
    let moduleData = {
      modules: [0],
      args: [resolverArgs],
    };

    const FEE = utils.parseEther("0.01")

    const [canExec, execData] = await poolInternal.checkerLastExecution();



    await ops
      .connect(executor)
      .exec(
        poolInternal.address,
        poolInternal.address,
        execData,
        moduleData,
        FEE,
        ETH,
        false,
        true
      );
    

}


export const getTaskId = (
  taskCreator: string,
  execAddress: string,
  execSelector: string,
  moduleData: any,
  feeToken: string
): string => {
  const encoded = utils.defaultAbiCoder.encode(
    ["address", "address", "bytes4", "tuple(uint8[], bytes[])", "address"],
    [
      taskCreator,
      execAddress,
      execSelector,
      [moduleData.modules, moduleData.args],
      feeToken,
    ]
  );

  const taskId = utils.keccak256(encoded);
  return taskId;
};


export const getGelatoCloStreamId = async ( poolInternal: PoolInternalV1, timestamp:number, interval:number, user:string) => {

  let  execSelector =  poolInternal.interface.getSighash("closeStreamFlow");
  const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const timeArgs = utils.defaultAbiCoder.encode(
    ["uint256", "uint256"],
    [timestamp + interval, interval]
  );

  let moduleData = {
    modules: [1,3],
    args: [timeArgs],
  };

  let taskId = getTaskId(
  poolInternal.address,
  poolInternal.address,
  execSelector,
  moduleData,
  ETH
);
  return taskId;

}

export const getGelatoCloStream = async ( poolInternal: PoolInternalV1, nextExec:number, interval:number,user:string,ops:IOps, executor:SignerWithAddress) => {

  let  execSelector =  poolInternal.interface.getSighash("closeStreamFlow");

  let execData = poolInternal.interface.encodeFunctionData("closeStreamFlow",[user] )
  const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const FEE = utils.parseEther("0.01")
  const timeArgs = utils.defaultAbiCoder.encode(
    ["uint256", "uint256"],
    [nextExec, interval]
  );

  let moduleData = {
    modules: [1,3],
    args: [timeArgs],
  };

 
  await ops
  .connect(executor)
  .exec(
    poolInternal.address,
    poolInternal.address,
    execData,
    moduleData,
    FEE,
    ETH,
    false,
    true
  );


}
