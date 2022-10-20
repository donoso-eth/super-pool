//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {DataTypes} from "../libraries/DataTypes.sol";
import {ISuperfluid, ISuperToken} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IResolverSettingsV2} from "./IResolverSettings-V2.sol";

interface IPoolInternalV2 {

     function initialize(IResolverSettingsV2 _resolverSettings, address _owner, ISuperToken _superToken) external;

    function _redeemDeposit(uint256 redeemAmount, address _supplier) external;

    function _tokensReceived(address from, uint256 amount) external;

    function _redeemFlow(int96 _outFlowRate, address _supplier) external;

    function createFlow(
        bytes memory newCtx,
        ISuperfluid.Context memory decodedContext,
        int96 inFlowRate,
        address sender
    ) external returns (bytes memory updatedCtx);

    function updateFlow(
        bytes memory newCtx,
        int96 inFlowRate,
        address sender
    ) external returns (bytes memory updatedCtx);

    function terminateFlow(bytes calldata newCtx, address sender) external returns (bytes memory updatedCtx);

    function _redeemFlowStop(address _supplier) external;

    function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) external view returns (uint256 yieldSupplier);

    function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier);

    function getPool(uint256 timestamp) external view returns (DataTypes.PoolV2 memory);

    function getLastPool() external view returns (DataTypes.PoolV2 memory);

     function getLastTimestmap() external view returns (uint256);

    function withdrawStep(address _receiver) external;

    function pushedToStrategy(uint256 amount) external;

    function transferSTokens(
        address _sender,
        address _receiver,
        uint256 amount
    ) external;
}
