//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {ISuperfluid, ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPoolV2 {
  // ====================== Called only once by deployment ===========================

  /**
   * @notice initializer when deployment the contract
   */
  function initialize(
    ISuperfluid _host,
    ISuperToken _superToken,
    IERC20 _token,
    address _owner
  ) external;



  // #region ===================== SUpplier interaction Pool Events  ===========================

  /**
   * @notice ERC277 call back allowing deposit tokens via .send()
   * @param from Supplier (user sending tokens)
   * @param amount amount received
   */
  function tokensReceived(
    address operator,
    address from,
    address to,
    uint256 amount,
    bytes calldata userData,
    bytes calldata operatorData
  ) external;

  /**
   * @notice User interactipn
   * @param redeemAmount amount to be reddemed
   */
  function redeemDeposit(uint256 redeemAmount) external;

  // #endregion ===================== SUpplier interaction Pool Events  ===========================

  // #region ===================== Superfluid stream Manipulation Area ===========================
  /**
   *  only calleded by Pool Internal when streams to create/update/delete
   *
   */
  function sfDeleteFlow(address sender, address receiver) external;

  function sfCreateFlow(address receiver, int96 newOutFlow) external;

  function sfUpdateFlow(address receiver, int96 newOutFlow) external;

  /// when the user send a stream in the case that he is already receiving a stream from the pool
  /// this action will stop the pool outgoing stream, as this action is triggered by the after create
  /// call
  function sfDeleteFlowWithCtx(
    bytes calldata _ctx,
    address sender,
    address receiver
  ) external returns (bytes memory newCtx);

  // #endregion ====================Superfluid stream Manipulation Area ==========================

  /**
   * @notice only called Internal
   *         payment for the gelato tasks will be done
   */
  //function transfer(uint256 _amount, address _paymentToken) external;

  function transferSuperToken(address receiver, uint256 amount) external;

  function internalPushToAAVE(uint256 amount) external;

  function internalEmitEvents(address _supplier,DataTypes.SupplierEvent code, bytes memory payload, address sender) external;

  function emitEventSupplier(address _supplier) external;

  function getPool(uint256 timestamp)
    external
    view
    returns (DataTypes.PoolV2 memory);

  function getLastPool() external view returns (DataTypes.PoolV2 memory);

  function getLastTimestmap() external view returns (uint256);

  function getSupplier(address _supplier)
    external
    view
    returns (DataTypes.Supplier memory supplier);
     function transfer(uint256 _amount, address _paymentToken) external;

     
  function getPrecission() external view returns (uint256);

  function setPrecission(uint256 _precission) external;

  function getPoolBuffer() external view returns (uint256);

  function setPoolBuffer(uint256 _poolBuffer) external ;

  function setSuperfluidDeposit(uint256 _superfluidDeposit) external;

  function getSuperfluidDeposit() external view returns (uint256);
  

  function setSteps(uint8 _steps) external;

  function getSteps() external view returns (uint8);
}
