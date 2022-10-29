//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {ISuperfluid, ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

interface IPoolV1 {
    // ====================== Called only once by deployment ===========================
    /**
     * @notice initializer when deployment the contract
     */
    function initialize(DataTypes.PoolInitializer memory poolInit) external;

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

    /**
     * @notice User starts a flow to be
     * @param _outFlowRate outflowrate to receive from the pool
     *
     ***    This method can be called to create a stream or update a previous one
     */
    function redeemFlow(int96 _outFlowRate) external;

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

    // function internalEmitEvents(address _supplier,DataTypes.SupplierEvent code, bytes memory payload, address sender) external;

    // function emitEventSupplier(address _supplier) external;

    // #region =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

    function getPool(uint256 timestamp) external view returns (DataTypes.PoolV1 memory);

    function getLastPool() external view returns (DataTypes.PoolV1 memory);

    function getLastTimestamp() external view returns (uint256);

    function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier);

    function getPrecission() external view returns (uint256);

    function getSteps() external view returns (uint8);

    function getPoolBuffer() external view returns (uint256);

    function getSuperfluidDeposit() external view returns (uint256);

    function getDepositTriggerAmount() external view returns (uint256);

    function getDepositTriggerTime() external view returns (uint256);

    function getProtocolFee() external view returns(uint256);

    function getVersion() external pure returns(uint256);


    // #endregion =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

    // #region  ============= =============  Internal && Pool Internal Functions   ============= ============= //
    function transferSuperToken(address receiver, uint256 amount) external;

    function internalPushToAAVE(uint256 amount) external;

    function internalWithDrawStep(address supplier, uint256 stepAmount) external;

    function transfer(uint256 _amount, address _paymentToken) external;

    // #endregion  ============= =============  Internal && Pool Internal Functions    ============= ============= //

    // #region =========== =============  PARAMETERS ONLY OWNER  ============= ============= //

    function setSteps(uint8 _steps) external;

    function setPoolBuffer(uint256 _poolBuffer) external;

    function setSuperfluidDeposit(uint256 _superfluidDeposit) external;

    function setPrecission(uint256 _precission) external;

    // #endregion =========== =============  PARAMETERS ONLY OWNER  ============= ============= //
}