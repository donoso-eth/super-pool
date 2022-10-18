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

  function poolUpdateCurrentState() external;

 function transferSTokens(
    address _sender,
    address _receiver,
    uint256 amount
   ) external;

  function supplierUpdateCurrentState(address _supplier) external;

  function getSupplierByAdress(address _supplier) external view returns (DataTypes.Supplier memory supplier);

  function getLastPool() external view returns (DataTypes.PoolV2 memory);

  function getPool(uint256 _timestamp) external view returns (DataTypes.PoolV2 memory) ;

  function transfer(uint256 _amount, address _paymentToken) external;

  function withdrawStep(address _receiver)  external;

  function pushedToStrategy(uint256 amount ) external;

  function initializeAfterSettings(IResolverSettingsV2 _resolverSettings ) external;

}
