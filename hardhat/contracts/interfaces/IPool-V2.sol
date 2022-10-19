//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {IResolverSettingsV2} from "./IResolverSettings-V2.sol";
import {ISuperfluid, ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import  {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
interface IPoolV2 {
  /**
   * @notice initializer of the contract/oracle
   */
 
   function initialize( ISuperfluid _host,
    ISuperToken _superToken,
    IERC20 _token,
    address _owner) external;

  function stopstream(
    address _receiver,
    bool _all,
    uint8 _flowType
  ) external;



function sfDeleteFlow(address sender, address receiver) external ;
 function sfCreateFlow( address receiver, int96 newOutFlow) external;

  function sfUpdateFlow(address receiver, int96 newOutFlow) external ;

  function transfer(uint256 _amount, address _paymentToken) external;
 function transferSuperToken (address receiver,uint256 amount) external;

 function sfDeleteFlowWithCtx(bytes calldata _ctx ,address sender, address receiver) external  returns (bytes memory newCtx);


  function initializeAfterSettings(IResolverSettingsV2 _resolverSettings ) external;

}
