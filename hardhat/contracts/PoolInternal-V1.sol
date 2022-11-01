//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {UUPSProxiable} from "./upgradability/UUPSProxiable.sol";

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {ISuperToken, ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {IOps} from "./gelato/IOps.sol";
import {LibDataTypes} from "./gelato/LibDataTypes.sol";

import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import {IPoolV1} from "./interfaces/IPool-V1.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

contract PoolInternalV1 is Initializable, UUPSProxiable {
    using SafeMath for uint256;

    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    address poolFactory;
    address owner;

    uint256 poolId;
    uint256 supplierId;

    IPoolV1 poolContract;

    IPoolStrategyV1 poolStrategy;

    ISuperToken superToken;

    mapping(address => DataTypes.Supplier) public suppliersByAddress;

    mapping(uint256 => address) supplierAdressById;

    mapping(uint256 => DataTypes.PoolV1) public poolByTimestamp;

    mapping(uint256 => uint256) public poolTimestampById;

    bytes32 balanceTreasuryTask;

    uint256 public lastPoolTimestamp;

    uint256 public PRECISSION;
    // 1 hour minimum flow == Buffer
    uint8 public STEPS; // proportinal decrease deposit
    uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
    uint256 public SUPERFLUID_DEPOSIT;
    uint256 public MIN_OUTFLOW_ALLOWED;
    uint256 public PROTOCOL_FEE;
    uint256 public DEPOSIT_TRIGGER_AMOUNT;
    uint256 lastExecution;
    uint256 public BALANCE_TRIGGER_TIME;
    IOps public ops;

    /**
     * @notice initializer of the Pool
     */
    function initialize(DataTypes.PoolInternalInitializer memory internalInit) external initializer {
        ///initialState
        poolFactory = msg.sender;
        owner = internalInit.owner;
        superToken = internalInit.superToken;

        poolStrategy = internalInit.poolStrategy;
        poolContract = internalInit.pool;

        ops = internalInit.ops;

        lastPoolTimestamp = block.timestamp;
        poolByTimestamp[block.timestamp] = DataTypes.PoolV1(0, block.timestamp, 0, 0, 0, 0, 0, 0, 0, DataTypes.Yield(0, 0, 0, 0, 0, 0, 0), DataTypes.APY(0, 0));

        poolTimestampById[0] = block.timestamp;

        PRECISSION = poolContract.getPrecission();
        PROTOCOL_FEE = poolContract.getProtocolFee();

        STEPS = poolContract.getSteps();
        SUPERFLUID_DEPOSIT = poolContract.getSuperfluidDeposit();
        POOL_BUFFER = poolContract.getPoolBuffer();
        MIN_OUTFLOW_ALLOWED = 3600;

        BALANCE_TRIGGER_TIME = 24 * 3600;

        balanceTreasuryTask = _createBalanceTreasuryTask();

        lastExecution = block.timestamp;
    }

    // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //

    function _tokensReceived(address from, uint256 amount) external onlyPool {
        ///// suppler config updated && pool
        _updateSupplierDeposit(from, amount, 0);
        _balanceTreasury();
    }

    function _redeemDeposit(uint256 redeemAmount, address _supplier) external onlyPool {
        _updateSupplierDeposit(_supplier, 0, redeemAmount);

        _withdrawTreasury(_supplier, _supplier, redeemAmount);
    }

    function _redeemFlow(int96 _outFlowRate, address _supplier) external onlyPool {
        uint256 realTimeBalance = poolContract.balanceOf(_supplier);

        require(realTimeBalance > 0, "NO_BALANCE");

        bytes memory placeHolder = "0x";

        _updateSupplierFlow(_supplier, 0, _outFlowRate, placeHolder);
    }

    function _redeemFlowStop(address _supplier) external onlyPool {
        _updateSupplierFlow(_supplier, 0, 0, "0x");
        _balanceTreasury();
    }

    function _closeAccount() external onlyPool {}

    function updateStreamRecord(
        bytes memory newCtx,
        int96 inFlowRate,
        address sender
    ) external onlyPool returns (bytes memory updateCtx) {
        updateCtx = _updateSupplierFlow(sender, inFlowRate, 0, newCtx);
        console.log(129);
    }

    // #endregion User Interaction PoolEvents

    // #region =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

    function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier) {
        supplier = suppliersByAddress[_supplier];
    }

    function getPool(uint256 timestamp) external view returns (DataTypes.PoolV1 memory pool) {
        pool = poolByTimestamp[timestamp];
    }

    function getLastPool() external view returns (DataTypes.PoolV1 memory pool) {
        pool = poolByTimestamp[lastPoolTimestamp];
    }

    function getLastTimestamp() external view returns (uint256) {
        return lastPoolTimestamp;
    }

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

    function getVersion() external pure returns (uint256) {
        return 1.0;
    }

    // #endregion =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

    // #region Pool Update ============= POOL UPDATE ============= ============= //

    /**************************************************************************
     * Pool Update
     *
     *************************************************************************/
    function _poolUpdate() public {
        DataTypes.PoolV1 memory lastPool = poolByTimestamp[lastPoolTimestamp];

        uint256 periodSpan = block.timestamp - lastPool.timestamp;

        uint256 currentYieldSnapshot = poolStrategy.balanceOf();

        console.log(191, currentYieldSnapshot);

        if (periodSpan > 0) {
            poolId++;

            DataTypes.PoolV1 memory pool = DataTypes.PoolV1(poolId, block.timestamp, 0, 0, 0, 0, 0, 0, 0, DataTypes.Yield(0, 0, 0, 0, 0, 0, 0), DataTypes.APY(0, 0));

            pool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;
            pool.depositFromOutFlowRate = uint96(lastPool.outFlowRate) * PRECISSION * periodSpan + lastPool.depositFromOutFlowRate;

            pool.deposit = lastPool.deposit;

            pool.nrSuppliers = supplierId;

            pool.yieldObject.yieldSnapshot = currentYieldSnapshot;
            console.log(208, currentYieldSnapshot);
            console.log(209, lastPool.yieldObject.yieldSnapshot);
            uint256 periodAccrued = pool.yieldObject.yieldSnapshot - lastPool.yieldObject.yieldSnapshot;
            console.log(211, periodAccrued.mul(PROTOCOL_FEE).div(100));
            pool.yieldObject.protocolYield = lastPool.yieldObject.protocolYield + periodAccrued.mul(PROTOCOL_FEE).div(100);
            console.log(213, 100 - PROTOCOL_FEE);
            pool.yieldObject.yieldAccrued = periodAccrued.mul(100 - PROTOCOL_FEE).div(100);

            pool.yieldObject.totalYield = lastPool.yieldObject.totalYield + pool.yieldObject.yieldAccrued;

            console.log(217);
            /// apy to be refined
            pool.apy.span = lastPool.apy.span + periodSpan;

            uint256 periodBalance = lastPool.deposit.add(lastPool.depositFromInFlowRate).add(lastPool.outFlowBuffer);
            console.log(207, periodBalance);

            uint256 periodApy = periodBalance == 0 ? 0 : pool.yieldObject.yieldAccrued.mul(365 * 24 * 3600 * 100).div(periodBalance);

            console.log(208, periodApy);

            pool.apy.apy = ((periodApy).add(lastPool.apy.span.mul(lastPool.apy.apy))).div(pool.apy.span);

            (pool.yieldObject.yieldTokenIndex, pool.yieldObject.yieldInFlowRateIndex, pool.yieldObject.yieldOutFlowRateIndex) = _calculateIndexes(pool.yieldObject.yieldAccrued, lastPool);
            console.log(235, pool.yieldObject.yieldTokenIndex, pool.yieldObject.yieldInFlowRateIndex, pool.yieldObject.yieldOutFlowRateIndex);
            pool.yieldObject.yieldTokenIndex = pool.yieldObject.yieldTokenIndex + lastPool.yieldObject.yieldTokenIndex;
            pool.yieldObject.yieldInFlowRateIndex = pool.yieldObject.yieldInFlowRateIndex + lastPool.yieldObject.yieldInFlowRateIndex;
            pool.yieldObject.yieldOutFlowRateIndex = pool.yieldObject.yieldOutFlowRateIndex + lastPool.yieldObject.yieldOutFlowRateIndex;
            pool.inFlowRate = lastPool.inFlowRate;
            pool.outFlowRate = lastPool.outFlowRate;
            pool.outFlowBuffer = lastPool.outFlowBuffer;

            pool.timestamp = block.timestamp;
            console.log(244, pool.yieldObject.yieldSnapshot);
            poolByTimestamp[block.timestamp] = pool;

            lastPoolTimestamp = block.timestamp;

            poolTimestampById[pool.id] = block.timestamp;
        }

        console.log("pool_update");
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
        console.log(261);
        uint256 dollarSecondsDeposit = lastPool.deposit * periodSpan;
        uint256 dollarSecondsInFlow = ((uint96(lastPool.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromInFlowRate * periodSpan;
        uint256 dollarSecondsOutFlow = ((uint96(lastPool.outFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromOutFlowRate * periodSpan;
        uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow - dollarSecondsOutFlow;

        /// we ultiply by PRECISSION
        console.log(269, dollarSecondsDeposit, dollarSecondsInFlow, dollarSecondsOutFlow);
        console.log(269, uint96(lastPool.inFlowRate));
        console.log(269, yieldPeriod);
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

    // #endregion POOL UPDATE

    // #region  ============= =============  Internal Supplier Update ============= ============= //

    function _getSupplier(address _supplier) internal returns (DataTypes.Supplier storage) {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

        if (supplier.createdTimestamp == 0) {
            supplier.createdTimestamp = block.timestamp;
            supplier.supplier = _supplier;
            supplier.timestamp = block.timestamp;
            supplierId = supplierId + 1;
            supplier.id = supplierId;
            poolByTimestamp[block.timestamp].nrSuppliers++;
            supplierAdressById[supplier.id] = _supplier;
        }

        return supplier;
    }

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

    /**
     * @notice Update the supplier to the current state (happens after interaction)
     * @param _supplier supplier's address
     *
     * @dev  it calculates the yield, adds the inflow inbetween if any and update the values
     *       when outflow (receiving flow) there is no update on the deposit as is diccounted
     *
     */
    function _supplierUpdateCurrentState(address _supplier) internal {
        DataTypes.Supplier storage supplier = _getSupplier(_supplier);
        DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

        if (supplier.timestamp < block.timestamp) {
            uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

            if (supplier.inStream > 0) {
                uint256 inflow = uint96(supplier.inStream) * (block.timestamp - supplier.timestamp);
                pool.depositFromInFlowRate = pool.depositFromInFlowRate - inflow * PRECISSION;
                pool.deposit = inflow * PRECISSION + pool.deposit;
                supplier.deposit = supplier.deposit + inflow * PRECISSION;
            } else if (supplier.outStream.flow > 0) {
                uint256 outflow = uint96(supplier.outStream.flow) * (block.timestamp - supplier.timestamp);

                pool.depositFromOutFlowRate = pool.depositFromOutFlowRate - outflow * PRECISSION;
                pool.deposit = pool.deposit - outflow * PRECISSION;
                supplier.deposit = supplier.deposit - outflow * PRECISSION;
            }

            pool.deposit = yieldSupplier + pool.deposit;
            supplier.deposit = supplier.deposit + yieldSupplier;
            supplier.timestamp = block.timestamp;
        }
        console.log("supplier_updte");
    }

    /**
     * @notice Update fo the pool when a supplier deposit via erc777 send i¡or withdraw via redeemDeposit()
     *
     * @param _supplier supplier's address
     * @param inDeposit supplier's depositing amount or
     * @param outDeposit supplier's withdrawal amount
     *
     * @dev  it update the pool, update the suppleir record and apply the changes to the pool
     *
     */
    function _updateSupplierDeposit(
        address _supplier,
        uint256 inDeposit,
        uint256 outDeposit
    ) internal {
        _poolUpdate();

        _supplierUpdateCurrentState(_supplier);

        DataTypes.Supplier storage supplier = _getSupplier(_supplier);

        supplier.deposit = supplier.deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;

        poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;
    }

    /**
     * @notice Update fo the pool when an stream event happened
     *
     * @param _supplier supplier's address
     * @param inFlow supplier's new Inflow
     * @param outFlow supplier's new Outflow
     * @param _ctx of the super app callback
     *
     * @dev  this method acts upon the changes in the streams:
     *       1) user send a stream ----> create the stream record nad update pool
     *       2) user update sending stream ----> update the stream record in the pool
     *       3) user stop sending stream ----> update the stream record
     *       4) user redeem flow (receiving stream):
     *              a) create stream record (_outstreamhaschanged() and creatOutStream())
     *              b) ensure Supertokens are available to cover the step in the pool, if not _withdrawTreasury()
     *                 will withdraw tokens from the strategy pool (in example is aave)
     *              c) create the Gelato task that will transfer after every step to ensure enough supertokens are available
     *              d) create the Superfluid stream from the superpool to the user
     *       5) user updates a receiving flow:
     *              a) update the stream record ---> if with the new flowrate there is no mminimal balance,
     *                 the stream will be stopped and the funds returned
     *              b,c,d) as case 4
     *       6) user stops redeeming flow --> update record and stop the superfluid stream
     *
     */
    function _updateSupplierFlow(
        address _supplier,
        int96 inFlow,
        int96 outFlow,
        bytes memory _ctx
    ) internal returns (bytes memory newCtx) {
        newCtx = _ctx;
        console.log(425);
        _poolUpdate();
        console.log(427);
        _supplierUpdateCurrentState(_supplier);
        console.log(428);
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

        int96 currentNetFlow = supplier.inStream - supplier.outStream.flow;
        int96 newNetFlow = inFlow - outFlow;
        

        if (currentNetFlow < 0) {
            /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE

            if (newNetFlow >= 0) {
                pool.outFlowRate = pool.outFlowRate + currentNetFlow;

                pool.inFlowRate = pool.inFlowRate + newNetFlow;

                ///// refactor logic
                if (newNetFlow == 0) {
                    poolContract.sfDeleteFlow(address(poolContract), _supplier);
                } else {
                    newCtx = poolContract.sfDeleteFlowWithCtx(_ctx, address(poolContract), _supplier);
                }

                _cancelTask(supplier.outStream.cancelWithdrawId);
                uint256 oldOutFlowBuffer = POOL_BUFFER.mul(uint96(-currentNetFlow));
                pool.outFlowBuffer -= oldOutFlowBuffer;
                supplier.outStream = DataTypes.OutStream(0, 0, bytes32(0));
                _balanceTreasury();
            } else {
                pool.outFlowRate = pool.outFlowRate + currentNetFlow - newNetFlow;

                _outStreamHasChanged(_supplier, -newNetFlow);
            }
        } else {
            /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

            if (newNetFlow >= 0) {
                pool.inFlowRate = pool.inFlowRate - currentNetFlow + inFlow;
                console.log(463);
                _balanceTreasury();
            } else {
                /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

                if (currentNetFlow > 0) {
                    poolContract.sfDeleteFlow(_supplier, address(poolContract));
                }
                pool.outFlowRate += -newNetFlow;
                pool.inFlowRate -= currentNetFlow;
                _outStreamHasChanged(_supplier, -newNetFlow);
          
            }
        }

        supplier.inStream = inFlow;
        supplier.outStream.flow = outFlow;
    }

    // #endregion

    function balanceTreasury() external onlyOps {
        require(block.timestamp >= lastExecution + BALANCE_TRIGGER_TIME, "NOT_YER_READY");
        (uint256 fee, address feeToken) = IOps(ops).getFeeDetails();
        poolContract.transfer(fee, feeToken);
        _balanceTreasury();
    }

    function _balanceTreasury() public {
        lastExecution = block.timestamp;
        console.log(509);
        (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(poolContract));
        if (balance > 0) {
            console.log(511, uint256(balance));
        } else {
            console.log(514, uint256(-balance));
        }
        DataTypes.PoolV1 storage currentPool = poolByTimestamp[lastPoolTimestamp];
        console.log(513);
        uint256 currentPoolBuffer = currentPool.outFlowBuffer;
        console.log(515);
        uint256 currentThreshold = currentPoolBuffer;
        console.log(517);
        int96 netFlow = currentPool.inFlowRate - currentPool.outFlowRate;
        console.log(519, uint96(currentPool.inFlowRate), uint96(currentPool.outFlowRate));
        if (netFlow < 0) {
            console.log("aqui");
            currentThreshold = currentThreshold + ((BALANCE_TRIGGER_TIME)) * uint96(-netFlow);
            console.log("aqui-NO");
        }
        console.log(525);
        if (uint256(balance) > currentThreshold) {
            uint256 toDeposit = uint256(balance) - currentThreshold;

            poolStrategy.pushToStrategy(toDeposit);
            console.log(513, currentPool.yieldObject.yieldSnapshot);
            currentPool.yieldObject.yieldSnapshot += toDeposit;
            console.log(515, currentPool.yieldObject.yieldSnapshot);
        } else if (currentThreshold > uint256(balance)) {
            uint256 amountToWithdraw = currentThreshold - uint256(balance);

            uint256 balanceAave = poolStrategy.balanceOf();

            if (amountToWithdraw > balanceAave) {
                amountToWithdraw = balanceAave;
            }

            poolStrategy.withdraw(amountToWithdraw, address(poolContract));
            currentPool.yieldObject.yieldSnapshot -= amountToWithdraw;
        }
    }

    /**
     * @notice internal withdrawal dispatcher when tokens movments are required,
     * can be to a supplier or from the pool strategy to the superpol
     *
     * @param _supplier supplier's address
     * @param _receiver the reciever addrss (can be the pool contract or the suppleir)
     * @param withdrawAmount  amount to withdraw
     *
     * @dev  if (_suppleir == _reciever) means the tokens must e transfered to the supplier
     *       else if (_supplier != _receiver) the tokens are transferred to the superpool to ensure the out flows
     *
     */
    function _withdrawTreasury(
        address _supplier,
        address _receiver,
        uint256 withdrawAmount
    ) internal {
        lastExecution = block.timestamp;
        DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];
        uint256 currentPoolBuffer = pool.outFlowBuffer;

        uint256 currentThreshold = currentPoolBuffer;

        int96 netFlow = pool.inFlowRate - pool.outFlowRate;
        console.log(576,uint96(pool.inFlowRate),uint96(pool.outFlowRate));
        console.log(564, "current_nert_flow", uint96(netFlow));

        if (netFlow < 0) {
            console.log(567, "I should not be here");
            currentThreshold = currentThreshold + (BALANCE_TRIGGER_TIME) * uint96(-netFlow);
        }
        //// calculate if any remaining balance of supertokens is inthe pool (push to strategy not yet ran)
        uint256 poolAvailable = 0;
        if (superToken.balanceOf(address(poolContract)) > (currentThreshold)) {
            poolAvailable = superToken.balanceOf(address(poolContract)) - (currentThreshold);
        }

        console.log(575, poolAvailable, withdrawAmount);
        //// if enough in the pool is available then not go to the pool strategy
        if (poolAvailable >= withdrawAmount) {
            //// if the withdrawal is to supplier then we must transfer
            console.log("NOT PUSHED");
            if (_supplier == _receiver) {
                poolContract.transferSuperToken(_receiver, withdrawAmount);
            }

            if (poolAvailable > withdrawAmount) {
                poolStrategy.pushToStrategy(poolAvailable - withdrawAmount);
                pool.yieldObject.yieldSnapshot += poolAvailable - withdrawAmount;
            }

            //// in the case the withdraw receiver is the pool, we don0t have to do anything as there is enoguh balance
        } else {
            //// not enough balance then we must withdraw from gtrategy
            console.log("YES PUSHED");
            uint256 balance = poolStrategy.balanceOf();

            uint256 fromStrategy = withdrawAmount - poolAvailable;
            console.log(594, "fromStrategy", fromStrategy);
            uint256 correction;
            if (fromStrategy > balance) {
                correction = fromStrategy - balance;

                if (balance > 0) {
                    poolStrategy.withdraw(balance, _receiver);
                    pool.yieldObject.yieldSnapshot = pool.yieldObject.yieldSnapshot - balance;
                }

                if (_supplier == _receiver) {
                    poolContract.transferSuperToken(_receiver, correction);
                }
            } else {
                poolStrategy.withdraw(fromStrategy, _receiver);
                pool.yieldObject.yieldSnapshot = pool.yieldObject.yieldSnapshot - fromStrategy;
                poolContract.transferSuperToken(_receiver, poolAvailable);
            }
        }
    }

    // #region  ============= =============  Internal Stream Functions ============= ============= //

    /**
     * @notice internal call from updteSupplierFlow() when a redeemflow has been started or updated
     *
     * @param _supplier supplier's address
     * @param newOutFlow supplier's new Outflow
     *
     * @dev  if the outflow does not exist, will be created, if does, will be updted
     */
    function _outStreamHasChanged(address _supplier, int96 newOutFlow) internal {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

        uint256 userBalance = poolContract.balanceOf(_supplier);
        uint256 streamDuration = userBalance.div(uint96(newOutFlow));
        uint256 outFlowBuffer = POOL_BUFFER.mul(uint96(newOutFlow));
        uint256 initialWithdraw = SUPERFLUID_DEPOSIT.mul(uint96(newOutFlow));

        console.log("Initial_withdraw", initialWithdraw);

        if (supplier.outStream.flow == 0) {
            if (userBalance < 24 * 3600 * uint96(newOutFlow)) {
                revert("No sufficent funds");
            }

            pool.outFlowBuffer += outFlowBuffer;
            supplier.outStream.cancelWithdrawId = _createCloseStreamTask(_supplier, streamDuration);

            _withdrawTreasury(_supplier, address(poolContract), initialWithdraw);
            supplier.outStream.streamDuration = streamDuration;
            poolContract.sfCreateFlow(_supplier, newOutFlow);
        } else if (supplier.outStream.flow > 0 && supplier.outStream.flow != newOutFlow) {
            if (userBalance < 24 * 3600 * uint96(newOutFlow)) {
                revert("No sufficent funds");
            }
            _cancelTask(supplier.outStream.cancelWithdrawId);
            supplier.outStream.cancelWithdrawId = _createCloseStreamTask(_supplier, streamDuration);
            supplier.outStream.streamDuration = streamDuration;

            if (supplier.outStream.flow > newOutFlow) {
                uint256 decreaseBuffer = POOL_BUFFER.add(SUPERFLUID_DEPOSIT).mul(uint96(supplier.outStream.flow - newOutFlow));
                pool.outFlowBuffer -= decreaseBuffer;
                _balanceTreasury();
            } else {
                uint256 increaseBuffer = POOL_BUFFER.add(SUPERFLUID_DEPOSIT).mul(uint96(newOutFlow - supplier.outStream.flow));
                pool.outFlowBuffer += increaseBuffer;
                uint256 oldInitialWithdraw = POOL_BUFFER.add(SUPERFLUID_DEPOSIT).mul(uint96(supplier.outStream.flow));
                _withdrawTreasury(_supplier, address(poolContract), initialWithdraw - oldInitialWithdraw);
                //To DO REBALANCE
            }
            poolContract.sfUpdateFlow(_supplier, newOutFlow);
        }
    }

    /**
     * @notice internal call from updteSupplierFlow() when a redeemflow has been started or updated
     *
     * @param _supplier supplier's address
     *
     * @dev  the outstream will be cancel when the withdrawset gelato task is in the last step
     *       or when the redeem flow has been updated and there is no wnough minimal balance
     */
    function closeStreamFlow(address _supplier) external onlyOps {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

        //// TODO clsoe stream transfer yield accrued while dscending
        uint256 userBalance = poolContract.balanceOf(_supplier);

        if (userBalance > 24 * 3600 * uint96(supplier.outStream.flow)) {}
        // pool.outFlowBuffer = pool.outFlowBuffer - minBalance;
        // _withdrawTreasury(_supplier, _supplier, userBalance);
        // pool.deposit = pool.deposit - userBalance;
        pool.outFlowRate = pool.outFlowRate - supplier.outStream.flow;
        supplier.deposit = 0;
        supplier.outStream = DataTypes.OutStream(0, 0, bytes32(0));
    }

    // #endregion  ============= =============  Internal Stream Functions ============= ============= //

    /**
     * @notice notified by the poolstrategy that a push hapened
     *
     * @param amount  amount pushed
     *
     * @dev after the strategy pushed tokens, the yield snspashot has to be updated to ensure the
     *      yield accrued will be accurated
     *
     */
    function pushedToStrategy(uint256 amount) external onlyPoolStrategy {
        poolByTimestamp[lastPoolTimestamp].yieldObject.yieldSnapshot += amount;
        poolContract.internalPushToAAVE(amount);
    }

    // #region  ============= =============  ERC20  ============= ============= //
    function transferSTokens(
        address _sender,
        address _receiver,
        uint256 amount
    ) external onlyPool {
        _poolUpdate();
        _supplierUpdateCurrentState(_sender);
        DataTypes.Supplier storage sender = _getSupplier(_sender);
        _supplierUpdateCurrentState(_receiver);
        DataTypes.Supplier storage receiver = _getSupplier(_receiver);

        sender.deposit = sender.deposit.sub(amount.mul(PRECISSION));
        receiver.deposit = receiver.deposit.add(amount.mul(PRECISSION));

        _balanceTreasury();
    }

    // #endregion  ============= =============  ERC20  ============= ============= //

    // #region ====================  Gelato Withdraw Step Task  ====================

    function cancelTask(bytes32 _taskId) public {
        IOps(ops).cancelTask(_taskId);
    }

    function _cancelTask(bytes32 taskId) internal {
        IOps(ops).cancelTask(taskId);
    }

    function _createBalanceTreasuryTask() internal returns (bytes32 taskId) {
        bytes memory resolverData = abi.encodeWithSelector(this.checkerLastExecution.selector);

        bytes memory resolverArgs = abi.encode(address(this), resolverData);

        LibDataTypes.Module[] memory modules = new LibDataTypes.Module[](1);

        modules[0] = LibDataTypes.Module.RESOLVER;

        bytes[] memory args = new bytes[](1);

        args[0] = resolverArgs;

        LibDataTypes.ModuleData memory moduleData = LibDataTypes.ModuleData(modules, args);
        taskId = IOps(ops).createTask(address(this), abi.encodePacked(this.balanceTreasury.selector), moduleData, ETH);
    }

    function checkerLastExecution() external view returns (bool canExec, bytes memory execPayload) {
        console.log(770, block.timestamp, lastExecution, BALANCE_TRIGGER_TIME);
        console.log(771, block.timestamp, lastExecution + BALANCE_TRIGGER_TIME);

        canExec = block.timestamp >= lastExecution + BALANCE_TRIGGER_TIME;

        execPayload = abi.encodeWithSelector(this.balanceTreasury.selector);
    }

    function _createCloseStreamTask(address _supplier, uint256 streamDuration) internal returns (bytes32 taskId) {
        bytes memory timeArgs = abi.encode(uint128(block.timestamp + streamDuration), streamDuration);

        bytes memory execData = abi.encodeWithSelector(this.closeStreamFlow.selector, _supplier);

        LibDataTypes.Module[] memory modules = new LibDataTypes.Module[](2);

        modules[0] = LibDataTypes.Module.TIME;
        modules[1] = LibDataTypes.Module.SINGLE_EXEC;

        bytes[] memory args = new bytes[](1);

        args[0] = timeArgs;

        LibDataTypes.ModuleData memory moduleData = LibDataTypes.ModuleData(modules, args);

        taskId = IOps(ops).createTask(address(this), execData, moduleData, ETH);
    }

    // #endregion ====================  Gelato Withdra step  ====================

    // #region  ==================  Upgradeable settings  ==================

    function proxiableUUID() public pure override returns (bytes32) {
        return keccak256("org.super-pool.pool-internal.v2");
    }

    function updateCode(address newAddress) external override onlyOwnerOrPoolFactory {
        require(msg.sender == owner, "only owner can update code");
        return _updateCodeAddress(newAddress);
    }

    // #endregion  ==================  Upgradeable settings  ==================

    // #region =========== =============  Modifiers ============= ============= //

    modifier onlyPool() {
        require(msg.sender == address(poolContract), "Only Pool");
        _;
    }

    modifier onlyPoolStrategy() {
        require(msg.sender == address(poolStrategy), "Only Strategy");
        _;
    }

    modifier onlyOps() {
        require(msg.sender == address(ops), "OpsReady: onlyOps");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only Owner");
        _;
    }

    modifier onlyOwnerOrPoolFactory() {
        require(msg.sender == poolFactory || msg.sender == owner, "Only Host");
        _;
    }

    // #endregion =========== =============  Modifiers ============= ============= //
}
