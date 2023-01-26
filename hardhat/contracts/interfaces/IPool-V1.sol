// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { DataTypes } from "../libraries/DataTypes.sol";
import { ISuperfluid, ISuperToken } from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import { IERC20 } from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IDelegatedPool {
  function _getSupplierBalance(address _supplier) external view returns (uint256 realtimeBalance);
}

interface IPoolV1 {
  // ====================== Called only once by deployment ===========================
  /**
   * @notice initializer when deployment the contract
   */
  function initialize(DataTypes.PoolInitializer memory poolInit) external;

  // #region ===================== Supplier interaction Pool Events  ===========================

  /**
   * @notice ERC277 call back allowing deposit tokens via .send()
   * @param from Supplier (user sending tokens)
   * @param amount amount received
   */
  function tokensReceived(address operator, address from, address to, uint256 amount, bytes calldata userData, bytes calldata operatorData) external;

  /**
   * @notice User interactipn
   * @param redeemAmount amount to be reddemed
   */
  function redeemDeposit(uint256 redeemAmount) external;

  /**
   * @notice User starts a flow to be
   * @param _outFlowRate outflowrate to receive from the pool
   *
   *    This method can be called to create a stream or update a previous one
   */
  function redeemFlow(int96 _outFlowRate) external;

  function taskClose(address _supplier) external;

  function balanceTreasury() external;

  /**
   * @notice User stop the receiving stream
   *
   */
  function redeemFlowStop() external;

  // #endregion ===================== SUpplier interaction Pool Events  ===========================

  // #region  ============= =============  ERC20  ============= ============= //
  function balanceOf(address _supplier) external view returns (uint256 balance);

  function totalSupply() external view returns (uint256);

  // #endregion overriding ERC20

  // #region =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

  function getPool(uint256 timestamp) external view returns (DataTypes.Pool memory);

  function getLastPool() external view returns (DataTypes.Pool memory);

  function getLastTimestamp() external view returns (uint256);

  function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier);

  function getVersion() external pure returns (uint256);

  function checkerLastExecution() external returns (bool canExec, bytes memory execPayload);

  // #endregion =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

  // #region =========== =============  PARAMETERS ONLY OWNER  ============= ============= //

  function setInternalContract(address _poolInternal) external;
  // #endregion =========== =============  PARAMETERS ONLY OWNER  ============= ============= //
}
