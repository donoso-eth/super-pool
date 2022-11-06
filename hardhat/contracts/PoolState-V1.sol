//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {IOps} from "./gelato/IOps.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";


contract PoolStateV1 {
    using SafeMath for uint256;
    using CFAv1Library for CFAv1Library.InitData;
    // #region pool state

    address public owner;
    address public poolFactory;

    //// TOKENS
    ISuperToken superToken;
    IERC20 token;

    //// SUPERFLUID
    using CFAv1Library for CFAv1Library.InitData;
    CFAv1Library.InitData public _cfaLib;
    ISuperfluid public host; // host
    IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address

    //// GELATO
    IOps public ops;
    address payable public gelato;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;
    bytes32 public balanceTreasuryTask;

    //// PARAMETERS

    uint256 MAX_INT;

    uint256 public PRECISSION;

    uint256 public SUPERFLUID_DEPOSIT;
    uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
    uint256 public MIN_OUTFLOW_ALLOWED; // 1 hour minimum flow == Buffer

    uint256 public DEPOSIT_TRIGGER_AMOUNT;
    uint256 public BALANCE_TRIGGER_TIME;

    uint256 public PROTOCOL_FEE;

    IPoolStrategyV1 poolStrategy;
    address poolInternal;

    ///// OTHERS
    using SafeMath for uint256;

    /// POOL STATE

    uint256 public poolId;
    uint256 public supplierId;

    mapping(address => DataTypes.Supplier) public suppliersByAddress;

    mapping(uint256 => DataTypes.PoolV1) public poolByTimestamp;

    uint256 public lastPoolTimestamp;

    uint256 lastExecution;


        /**
     * @notice Calculate the yield earned by the suplier
     * @param _supplier supplier's address
     * @return yieldSupplier uint256 yield erarnd
     *
     * @dev  it calculates the yield between the last pool update and the last supplier interaction
     *       it uses two indexes (per deosit and flow), the yield is (timespan)(diff index's)
     */
    function _calculateYieldSupplier(address _supplier) public view returns (uint256 yieldSupplier) {
        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];
        DataTypes.PoolV1 memory supplierPool = poolByTimestamp[supplier.timestamp];

        ///// Yield from deposit

        uint256 yieldFromDeposit = (supplier.deposit * (lastPool.yieldObject.yieldTokenIndex - supplierPool.yieldObject.yieldTokenIndex)).div(PRECISSION);
        uint256 yieldFromFlow = 0;
        uint256 yieldFromOutFlow = 0;

        yieldSupplier = yieldFromDeposit;
        if (supplier.inStream > 0) {
            ///// Yield from flow
            yieldFromFlow = uint96(supplier.inStream) * (lastPool.yieldObject.yieldInFlowRateIndex - supplierPool.yieldObject.yieldInFlowRateIndex);
        }

        if (supplier.outStream.flow > 0) {
            ///// Yield from flow
            yieldFromOutFlow = uint96(supplier.outStream.flow) * (lastPool.yieldObject.yieldOutFlowRateIndex - supplierPool.yieldObject.yieldOutFlowRateIndex);
        }

        yieldSupplier = yieldSupplier + yieldFromFlow - yieldFromOutFlow;
    }



    function _calculateIndexes(uint256 yieldPeriod, DataTypes.PoolV1 memory lastPool)
        public
        view
        returns (
            uint256 periodYieldTokenIndex,
            uint256 periodYieldInFlowRateIndex,
            uint256 periodYieldOutFlowRateIndex
        )
    {
        uint256 periodSpan = block.timestamp - lastPool.timestamp;

        uint256 dollarSecondsDeposit = lastPool.deposit * periodSpan;
        uint256 dollarSecondsInFlow = ((uint96(lastPool.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromInFlowRate * periodSpan;
        uint256 dollarSecondsOutFlow = ((uint96(lastPool.outFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromOutFlowRate * periodSpan;
        uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow - dollarSecondsOutFlow;

        /// we ultiply by PRECISSION

        if (totalAreaPeriod != 0 && yieldPeriod != 0) {
            uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
            uint256 outFlowContribution = (dollarSecondsOutFlow * PRECISSION);
            uint256 depositContribution = (dollarSecondsDeposit * PRECISSION * PRECISSION);
            if (lastPool.deposit != 0) {
                periodYieldTokenIndex = ((depositContribution * yieldPeriod).div((lastPool.deposit) * totalAreaPeriod));
            }
            if (lastPool.inFlowRate != 0) {
                periodYieldInFlowRateIndex = ((inFlowContribution * yieldPeriod).div(uint96(lastPool.inFlowRate) * totalAreaPeriod));
            }
            if (lastPool.outFlowRate != 0) {
                periodYieldOutFlowRateIndex = ((outFlowContribution * yieldPeriod).div(uint96(lastPool.outFlowRate) * totalAreaPeriod));
            }
        }
    }
    // #endregion pool state


        function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) public view returns (uint256 yieldSupplier) {
        uint256 yieldTilllastPool = _calculateYieldSupplier(_supplier);
        DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];

        uint256 yieldAccruedSincelastPool = 0;
        if (currentYieldSnapshot > lastPool.yieldObject.yieldSnapshot) {
            yieldAccruedSincelastPool = currentYieldSnapshot - lastPool.yieldObject.yieldSnapshot;
        }

        (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex, uint256 yieldOutFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
        uint256 yieldInFlow = uint96(supplier.inStream) * yieldInFlowRateIndex;
        uint256 yieldOutFlow = uint96(supplier.outStream.flow) * yieldOutFlowRateIndex;

        yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow - yieldOutFlow;
    }

}