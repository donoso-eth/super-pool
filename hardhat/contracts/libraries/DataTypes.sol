// SPDX-License-Identifier: AGPL-3.0-only
pragma solidity ^0.8.0;

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @title DataTypes
 * @author donoso_eth
 *
 * @notice A standard library of data types used throughout.
 */
library DataTypes {
  struct SuperPoolInput {
    address poolFactory;
    address superToken;
    address ops;
    address token;
  }

  struct PoolFactoryInitializer {
    ISuperfluid host;
    ISuperToken superToken;
    address ops;
    IERC20 token;
  }

  struct Stream {
    int96 flow;
    bytes32 cancelTaskId;

  }


  struct OutAssets{
    int96 flow;
    bytes32 cancelTaskId;
    uint256 stepAmount;
    uint256 stepTime;
    bytes32 cancelWithdrawId;

  }

  struct Deposit {
    uint256 amount;
    uint256 totalSupplied;
  
  }

  struct Supplier {
    address supplier;
    uint256 supplierId;
    uint256 cumulatedYield;
    Stream inStream;
    Stream outStream;
    OutAssets outAssets;
    Deposit deposit;
    uint256 shares;
    uint256 timestamp;
    uint256 createdTimestamp;
    uint256 eventId;

  }

  struct Period {
    uint256 timestamp;
    uint256 deposit;
    int96 inFlowRate;
    int96 outFlowRate;
    uint256 depositFromInFlowRate;
    uint256 depositFromOutFlowRate;
    uint256 yieldTokenIndex;
    uint256 yieldInFlowRateIndex;
    uint256 yieldOutFlowRateIndex;
    uint256 yieldAccruedSec;
    uint256 totalShares;
    int96 outFlowAssetsRate;
  }

  struct PeriodV2 {
    uint256 timestamp;
    uint256 deposit;
    int96 inFlowRate;
    int96 outFlowRate;
    uint256 depositFromInFlowRate;
    uint256 depositFromOutFlowRate;
    uint256 yieldTokenIndex;
    uint256 yieldInFlowRateIndex;
    uint256 yieldOutFlowRateIndex;
    uint256 totalShares;
    int96 outFlowAssetsRate;
    uint256 yieldAccrued;
  }

}
