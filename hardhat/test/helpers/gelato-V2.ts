import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { utils } from "ethers";
import { GelatoTasksV2, IOps, PoolFactoryV2, PoolStrategyV2 } from "../../typechain-types";


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


export const getGelatoWithdrawStepId = async (pool: PoolFactoryV2,gelatoTask: GelatoTasksV2, timestamp:number, interval:number, user:string) => {

  let  execSelector =  pool.interface.getSighash("withdrawStep");
  const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';
  const timeArgs = utils.defaultAbiCoder.encode(
    ["uint256", "uint256"],
    [timestamp + interval, interval]
  );

  let moduleData = {
    modules: [1],
    args: [timeArgs],
  };

  let taskId = getTaskId(

  gelatoTask.address,
  pool.address,
  execSelector,
  moduleData,
  ETH
);
  return taskId;

}


export const gelatoWithdrawStep = async (pool: PoolFactoryV2,gelatoTask: GelatoTasksV2, ops:IOps, executor:SignerWithAddress, user:string, timestamp:number, interval:number) => {
    
  const ETH = '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE';

  const execData =  pool.interface.encodeFunctionData("withdrawStep",[user]);
  const timeArgs = utils.defaultAbiCoder.encode(
    ["uint256", "uint256"],
    [timestamp + interval, interval]
  );


  let moduleData = {
    modules: [1],
    args: [timeArgs],
  };

  let  execSelector =  pool.interface.getSighash("withdrawStep");
  let taskId = getTaskId(

    gelatoTask.address,
    pool.address,
    execSelector,
    moduleData,
    ETH
  );



  const FEE = utils.parseEther("0.1")

  await ops
    .connect(executor)
    .exec(
      gelatoTask.address,
      pool.address,
      execData,
      moduleData,
      FEE,
      ETH,
      false,
      true
    );

}