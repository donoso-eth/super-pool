//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import {ISuperToken, ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";

import {IOps} from "./gelato/IOps.sol";

import {ISTokenV2} from "./interfaces/ISToken-V2.sol";
import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";
import {IGelatoTasksV2} from "./interfaces/IGelatoTasks-V2.sol";
import {IResolverSettingsV2} from "./interfaces/IResolverSettings-V2.sol";
import {IPoolV2} from "./interfaces/IPool-V2.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

contract PoolInternalV2 is Initializable, UUPSUpgradeable {
    using SafeMath for uint256;

    address owner;

    uint256 poolId;
    uint256 supplierId;

    IPoolV2 poolContract;
    ISTokenV2 sToken;
    IPoolStrategyV2 poolStrategy;
    IGelatoTasksV2 gelatoTasks;
    IResolverSettingsV2 resolverSettings;

    ISuperToken superToken;

    mapping(address => DataTypes.Supplier) public suppliersByAddress;

    mapping(uint256 => address) supplierAdressById;

    mapping(uint256 => DataTypes.PoolV2) public poolByTimestamp;

    mapping(uint256 => uint256) public poolTimestampById;

    uint256 public lastPoolTimestamp;

    uint256 public PRECISSION;
    // 1 hour minimum flow == Buffer
    uint8 public STEPS; // proportinal decrease deposit
    uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
    uint256 public SUPERFLUID_DEPOSIT;
    uint56 public MIN_OUTFLOW_ALLOWED;
    IOps public ops;

    /**
     * @notice initializer of the Pool
     */
    function initialize(
        IResolverSettingsV2 _resolverSettings,
        address _owner,
        ISuperToken _superToken
    ) external initializer {
        ///initialState

        owner = _owner;
        resolverSettings = _resolverSettings;
        poolContract = IPoolV2(resolverSettings.getPool());
        poolStrategy = IPoolStrategyV2(resolverSettings.getPoolStrategy());
        gelatoTasks = IGelatoTasksV2(resolverSettings.getGelatoTasks());
        sToken = ISTokenV2(resolverSettings.getSToken());
        ops = IOps(resolverSettings.getGelatoOps());

        lastPoolTimestamp = block.timestamp;
        poolByTimestamp[block.timestamp] = DataTypes.PoolV2(0, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

        poolTimestampById[0] = block.timestamp;

        PRECISSION = resolverSettings.getPrecission();

        STEPS = resolverSettings.getSteps();
        SUPERFLUID_DEPOSIT = resolverSettings.getSuperfluidDeposit();
        POOL_BUFFER = resolverSettings.getPoolBuffer();
        MIN_OUTFLOW_ALLOWED = 3600;

        superToken = _superToken;
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    function getSupplier(address _supplier) external view returns (DataTypes.Supplier memory supplier) {
        supplier = suppliersByAddress[_supplier];
    }

    function getPool(uint256 timestamp) external view returns (DataTypes.PoolV2 memory pool) {
        pool = poolByTimestamp[timestamp];
    }

    function getLastPool() external view returns (DataTypes.PoolV2 memory pool) {
        pool = poolByTimestamp[lastPoolTimestamp];
    }

    function getLastTimestmap() external view returns (uint256) {
       return lastPoolTimestamp;
    }

    // ============= ============= POOL UPDATE ============= ============= //
    // #region Pool Update

    /**************************************************************************
     * Pool Update
     *
     *************************************************************************/

    function _poolUpdate() public {
        DataTypes.PoolV2 memory lastPool = poolByTimestamp[lastPoolTimestamp];

        uint256 periodSpan = block.timestamp - lastPool.timestamp;

        uint256 currentYieldSnapshot = poolStrategy.balanceOf();
        console.log(128, periodSpan);
        if (periodSpan > 0) {
            poolId++;

            DataTypes.PoolV2 memory pool = DataTypes.PoolV2(poolId, block.timestamp, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, DataTypes.APY(0, 0));

            pool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;

            pool.deposit = lastPool.deposit;

            pool.yieldSnapshot = currentYieldSnapshot;

            pool.yieldAccrued = pool.yieldSnapshot - lastPool.yieldSnapshot;

            pool.totalYield = lastPool.totalYield + pool.yieldAccrued;
            console.log(143);
            pool.apy.span = lastPool.apy.span + periodSpan;
            uint256 periodApy;

            periodApy = lastPool.deposit == 0 ? 0 : pool.yieldAccrued.mul(365 * 24 * 3600 * 100).div(periodSpan).div(lastPool.deposit);

            pool.apy.apy = ((periodSpan.mul(periodApy)).add(lastPool.apy.span.mul(lastPool.apy.apy))).div(pool.apy.span);
            console.log(150);
            (pool.yieldTokenIndex, pool.yieldInFlowRateIndex) = _calculateIndexes(pool.yieldAccrued, lastPool);

            pool.yieldTokenIndex = pool.yieldTokenIndex + lastPool.yieldTokenIndex;
            pool.yieldInFlowRateIndex = pool.yieldInFlowRateIndex + lastPool.yieldInFlowRateIndex;
            console.log(155);
            pool.inFlowRate = lastPool.inFlowRate;
            pool.outFlowRate = lastPool.outFlowRate;
            pool.outFlowBuffer = lastPool.outFlowBuffer;

            pool.timestamp = block.timestamp;

            poolByTimestamp[block.timestamp] = pool;

            lastPoolTimestamp = block.timestamp;

            poolTimestampById[pool.id] = block.timestamp;
        }

        console.log("pool_update");
    }

    function _calculateIndexes(uint256 yieldPeriod, DataTypes.PoolV2 memory lastPool) public view returns (uint256 periodYieldTokenIndex, uint256 periodYieldInFlowRateIndex) {
        //DataTypes.PoolV2 memory lastPool = lastPool;

        uint256 periodSpan = block.timestamp - lastPool.timestamp;

        uint256 dollarSecondsInFlow = ((uint96(lastPool.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromInFlowRate * periodSpan;
        uint256 dollarSecondsDeposit = lastPool.deposit * periodSpan;

        uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow;

        /// we ultiply by PRECISSION for 5 decimals precision

        if (totalAreaPeriod == 0 || yieldPeriod == 0) {
            periodYieldTokenIndex = 0;
            periodYieldInFlowRateIndex = 0;
        } else {
            uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
            uint256 depositContribution = (dollarSecondsDeposit * PRECISSION * PRECISSION);
            if (lastPool.deposit != 0) {
                periodYieldTokenIndex = ((depositContribution * yieldPeriod).div((lastPool.deposit) * totalAreaPeriod));
            }
            if (lastPool.inFlowRate != 0) {
                periodYieldInFlowRateIndex = ((inFlowContribution * yieldPeriod).div(uint96(lastPool.inFlowRate) * totalAreaPeriod));
            }
        }
    }

    // #endregion POOL UPDATE
    // #region  ============= =============  Internal Supplier Functions ============= ============= //

    function _getSupplier(address _supplier) internal returns (DataTypes.Supplier storage) {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        console.log(193,supplier.timestamp);
        console.log(supplierId);
        if (supplier.createdTimestamp == 0) {
            supplier.createdTimestamp = block.timestamp;
            supplier.supplier = _supplier;
            supplier.timestamp = block.timestamp;
            supplierId = supplierId +1;
            supplier.id = supplierId;

            supplierAdressById[supplier.id] = _supplier;
        }

        return supplier;
    }

    function _supplierUpdateCurrentState(address _supplier) internal {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

        if (supplier.timestamp < block.timestamp) {
            uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

            if (supplier.inStream.flow > 0) {
                uint256 inflow = uint96(supplier.inStream.flow) * (block.timestamp - supplier.timestamp);

                pool.depositFromInFlowRate = pool.depositFromInFlowRate - inflow * PRECISSION;
                pool.deposit = inflow * PRECISSION + pool.deposit;
                supplier.deposit = supplier.deposit + inflow * PRECISSION;
            }

            if (supplier.outStream.flow > 0) {
                // pool.deposit = yieldSupplier + pool.deposit;
                // supplier.deposit = supplier.deposit + yieldSupplier;
            }

            pool.deposit = yieldSupplier + pool.deposit;
            supplier.deposit = supplier.deposit + yieldSupplier;
            supplier.timestamp = block.timestamp;
        }
    }

    function _updateSupplierDeposit(
        address _supplier,
        uint256 inDeposit,
        uint256 outDeposit
    ) internal {
        DataTypes.Supplier storage supplier = _getSupplier(_supplier);

        _supplierUpdateCurrentState(_supplier);
        
        supplier.deposit = supplier.deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;

        poolByTimestamp[block.timestamp].deposit = poolByTimestamp[block.timestamp].deposit + inDeposit * PRECISSION - outDeposit * PRECISSION;
    }

    function _inStreamCallback(
        address from,
        int96 inFlow,
        int96 outFlow,
        bytes memory _ctx
    ) internal returns (bytes memory newCtx) {
        newCtx = _ctx;
        _poolUpdate();
        console.log(176);
        newCtx = _updateSupplierFlow(from, inFlow, 0, _ctx);
        console.log(278);
    }

    function _updateSupplierFlow(
        address _supplier,
        int96 inFlow,
        int96 outFlow,
        bytes memory _ctx
    ) internal returns (bytes memory newCtx) {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];
        newCtx = _ctx;
        console.log(291);
        _supplierUpdateCurrentState(_supplier);
        console.log(293,uint96(supplier.outStream.flow));
        int96 currentNetFlow = supplier.inStream.flow - supplier.outStream.flow;
        int96 newNetFlow = inFlow - outFlow;

  
        if (currentNetFlow < 0) {
            /// PREVIOUS FLOW NEGATIVE AND CURRENT FLOW POSITIVE

            if (newNetFlow >= 0) {

                console.log(286);

                pool.outFlowRate = pool.outFlowRate + currentNetFlow;

                pool.inFlowRate = pool.inFlowRate + newNetFlow;


             

                ///// refactor logic
                if (newNetFlow == 0) {
                    poolContract.sfDeleteFlow(address(poolContract), _supplier);
                } else {
                    newCtx = poolContract.sfDeleteFlowWithCtx(_ctx, address(poolContract), _supplier);
                }

                gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);
                uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
                supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
                pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
                pool.outFlowBuffer = pool.outFlowBuffer - supplier.outStream.minBalance;
                supplier.outStream = DataTypes.OutStream(0, bytes32(0), 0, 0, 0, 0, bytes32(0));
            } else {
                pool.outFlowRate = pool.outFlowRate + currentNetFlow - newNetFlow;

                //   pool.deposit = pool.deposit - supplier.deposit;

                //// creatre timed task
                _outStreamHasChanged(_supplier, -newNetFlow);
            }
        } else {
            /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

            console.log(330);

            if (newNetFlow >= 0) {
                pool.inFlowRate = pool.inFlowRate - currentNetFlow + inFlow;
            } else {
                /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

                pool.outFlowRate += -newNetFlow;
                pool.inFlowRate -= currentNetFlow;

                pool.deposit = pool.deposit;
                if (currentNetFlow > 0) {
                    poolContract.sfDeleteFlow(_supplier, address(poolContract));
                }
                if (supplier.inStream.cancelFlowId != bytes32(0)) {
                    cancelTask(supplier.inStream.cancelFlowId);
                }

                _outStreamHasChanged(_supplier, -newNetFlow);
            }
        }

        supplier.inStream.flow = inFlow;
        supplier.outStream.flow = outFlow;
    }

    function _createOutStream(
        address _supplier,
        uint256 newMinBalance,
        int96 newOutFlow,
        uint256 prevoiusMinBalance,
        uint256 stepAmount,
        uint256 stepTime
    ) internal {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

        if (newMinBalance > prevoiusMinBalance) {
            _withdrawDispatcher(_supplier, address(poolContract), newMinBalance - prevoiusMinBalance);
        }

        pool.outFlowBuffer = pool.outFlowBuffer + newMinBalance;
        pool.deposit = pool.deposit - newMinBalance.mul(PRECISSION);

        supplier.deposit = supplier.deposit - newMinBalance.mul(PRECISSION);

        supplier.outStream.minBalance = newMinBalance;

        supplier.outStream.stepAmount = stepAmount;

        supplier.outStream.stepTime = stepTime;
        supplier.outStream.initTime = block.timestamp;

        supplier.outStream.cancelWithdrawId = gelatoTasks.createWithdraStepTask(_supplier, supplier.outStream.stepTime);
    }

    function _outStreamHasChanged(address _supplier, int96 newOutFlow) internal {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

        uint256 userBalance = sToken.balanceOf(_supplier);
        uint256 stepTime = userBalance.div(uint256(STEPS)).div(uint96(newOutFlow));
        uint256 stepAmount = (uint96(newOutFlow)) * (stepTime);
        uint256 minBalance = stepAmount.add((POOL_BUFFER.add(SUPERFLUID_DEPOSIT)).mul(uint96(newOutFlow)));

        if (supplier.outStream.flow == 0) {
            if (userBalance < minBalance) {
                revert("No sufficent funds");
            }

            // poolStrategy.withdraw(minBalance, address(this));
            _createOutStream(_supplier, minBalance, newOutFlow, 0, stepAmount, stepTime);
            poolContract.sfCreateFlow(_supplier, newOutFlow);
        } else if (supplier.outStream.flow > 0) {
            if (supplier.outStream.cancelFlowId != bytes32(0)) {
                cancelTask(supplier.outStream.cancelFlowId);
            }

            if (userBalance < minBalance) {
                _cancelFlow(_supplier, userBalance, minBalance);
            } else if (supplier.outStream.flow != newOutFlow) {
                gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);

                uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
                supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
                pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
                pool.outFlowBuffer = pool.outFlowBuffer - supplier.outStream.minBalance;
                _createOutStream(_supplier, minBalance, newOutFlow, supplier.outStream.minBalance, stepAmount, stepTime);
                poolContract.sfUpdateFlow(_supplier, newOutFlow);
            }
        }
    }

    function _withdrawDispatcher(
        address _supplier,
        address _receiver,
        uint256 withdrawAmount
    ) internal {
        DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

        uint256 poolAvailable = 0;
        if (superToken.balanceOf(address(poolContract)) > (pool.outFlowBuffer)) {
            poolAvailable = superToken.balanceOf(address(poolContract)) - (pool.outFlowBuffer);
        }

        if (poolAvailable >= withdrawAmount) {
            console.log("NOT PUSHED");
            if (_supplier == _receiver) {
                poolContract.transferSuperToken(_receiver, withdrawAmount);
            }
        } else {
            console.log("YES PUSHED");
            uint256 balance = poolStrategy.balanceOf();
            uint256 fromStrategy = withdrawAmount - poolAvailable;
            uint256 correction;
            if (fromStrategy > balance) {
                correction = fromStrategy - balance;
                poolStrategy.withdraw(balance, _receiver);
                pool.yieldSnapshot = pool.yieldSnapshot - fromStrategy;
                if (_supplier == _receiver) {
                    poolContract.transferSuperToken(_receiver, correction);
                }
            } else {
                poolStrategy.withdraw(fromStrategy, _receiver);
                pool.yieldSnapshot = pool.yieldSnapshot - fromStrategy;
            }
        }
    }

    function _cancelFlow(
        address _receiver,
        uint256 userBalance,
        uint256 minBalance
    ) internal {
        DataTypes.Supplier storage supplier = suppliersByAddress[_receiver];
        DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];

        gelatoTasks.cancelTask(supplier.outStream.cancelWithdrawId);

        pool.outFlowBuffer = pool.outFlowBuffer - minBalance;
        _withdrawDispatcher(_receiver, _receiver, userBalance);
        pool.deposit = pool.deposit - userBalance;
        pool.outFlowRate = pool.outFlowRate - supplier.outStream.flow;
        supplier.deposit = 0;
        supplier.outStream = DataTypes.OutStream(0, bytes32(0), 0, 0, 0, 0, bytes32(0));
    }

    function _calculateYieldSupplier(address _supplier) public view returns (uint256 yieldSupplier) {
        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        uint256 lastTimestamp = supplier.timestamp;

        DataTypes.PoolV2 memory lastPool = poolByTimestamp[lastPoolTimestamp];
        DataTypes.PoolV2 memory lastSupplierPool = poolByTimestamp[supplier.timestamp];

        ///// Yield from deposit

        uint256 yieldFromDeposit = (supplier.deposit * (lastPool.yieldTokenIndex - lastSupplierPool.yieldTokenIndex)).div(PRECISSION);

        yieldSupplier = yieldFromDeposit;
        if (supplier.inStream.flow > 0) {
            ///// Yield from flow
            uint256 yieldFromFlow = uint96(supplier.inStream.flow) * (lastPool.yieldInFlowRateIndex - lastSupplierPool.yieldInFlowRateIndex);

            yieldSupplier = yieldSupplier + yieldFromFlow;
        }
    }

    // #endregion
    function totalYieldEarnedSupplier(address _supplier, uint256 currentYieldSnapshot) public view returns (uint256 yieldSupplier) {
        uint256 yieldTilllastPool = _calculateYieldSupplier(_supplier);
        DataTypes.PoolV2 memory lastPool = poolByTimestamp[lastPoolTimestamp];

        uint256 yieldAccruedSincelastPool = 0;
        if (currentYieldSnapshot > lastPool.yieldSnapshot) {
            yieldAccruedSincelastPool = currentYieldSnapshot - lastPool.yieldSnapshot;
        }

        (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
        uint256 yieldInFlow = uint96(supplier.inStream.flow) * yieldInFlowRateIndex;

        yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow;
    }

    // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //

    function _tokensReceived(address from, uint256 amount) external onlyPool {
        _poolUpdate();

        ///// suppler config updated && pool
        _updateSupplierDeposit(from, amount, 0);
    }

    function _redeemDeposit(uint256 redeemAmount, address _supplier) external onlyPool {
        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        //// Update pool state "pool Struct" calculating indexes and timestamp
        _poolUpdate();

        ///// suppler config updated && pool
        _updateSupplierDeposit(_supplier, 0, redeemAmount);

        //poolStrategy.withdraw(redeemAmount, _supplier);
        _withdrawDispatcher(_supplier, _supplier, redeemAmount);

        if (supplier.outStream.flow > 0) {
            uint256 userBalance = sToken.balanceOf(_supplier);
            if (userBalance < supplier.outStream.minBalance) {
                _cancelFlow(_supplier, userBalance, supplier.outStream.minBalance);
            }
        }
    }

    function createFlow(
        bytes memory newCtx,
        ISuperfluid.Context memory decodedContext,
        int96 inFlowRate,
        address sender
    ) external onlyPool returns (bytes memory updateCtx) {
        DataTypes.Supplier storage supplier = _getSupplier(sender);
        if (decodedContext.userData.length > 0) {
            uint256 endSeconds = parseLoanData(decodedContext.userData);

            supplier.inStream.cancelFlowId = gelatoTasks.createStopStreamTimedTask(sender, endSeconds - MIN_OUTFLOW_ALLOWED, false, 1);
        }

        updateCtx = _inStreamCallback(sender, inFlowRate, 0, newCtx);
        console.log(579);
    }

    function updateFlow(
        bytes memory newCtx,
        int96 inFlowRate,
        address sender
    ) external onlyPool returns (bytes memory updatedCtx) {
        DataTypes.Supplier storage supplier = _getSupplier(sender);
        updatedCtx = _inStreamCallback(sender, inFlowRate, 0, newCtx);
    }

    function terminateFlow(bytes calldata newCtx, address sender) external onlyPool returns (bytes memory updateCtx) {
        DataTypes.Supplier storage supplier = _getSupplier(sender);
        updateCtx = _inStreamCallback(sender, 0, 0, newCtx);
    }

    function _redeemFlow(int96 _outFlowRate, address _supplier) external onlyPool {
        //// update state supplier

        uint256 realTimeBalance = sToken.balanceOf(_supplier);

        require(realTimeBalance > 0, "NO_BALANCE");

        console.log(602);

        _poolUpdate();

        console.log(607);

        bytes memory placeHolder = "0x";

        _updateSupplierFlow(_supplier, 0, _outFlowRate, placeHolder);
    }

    function pushedToStrategy(uint256 amount) external onlyPoolStrategy {
        poolByTimestamp[lastPoolTimestamp].yieldSnapshot += amount;
    }

    function _redeemFlowStop(address _supplier) external onlyPool {
      console.log('590 pool');
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

        console.log(585);

        require(supplier.outStream.flow > 0, "OUT_STREAM_NOT_EXISTS");

        _inStreamCallback(_supplier, 0, 0, "0x");
    }

    //// #endregion

    function transferSTokens(
        address _sender,
        address _receiver,
        uint256 amount
    ) external onlySToken {

       
        _poolUpdate();
        _supplierUpdateCurrentState(_sender);
        DataTypes.Supplier storage sender = _getSupplier(_sender);
         _supplierUpdateCurrentState(_receiver);
         DataTypes.Supplier storage receiver = _getSupplier(_receiver);



        sender.deposit = sender.deposit.sub(amount.mul(PRECISSION));
        receiver.deposit = receiver.deposit.add(amount.mul(PRECISSION));

         }

    function withdrawStep(address _receiver) external onlyOps {
        //// check if

        _poolUpdate();
        _supplierUpdateCurrentState(_receiver);

        //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
        uint256 fee;
        address feeToken;

        (fee, feeToken) = IOps(ops).getFeeDetails();

        poolContract.transfer(fee, feeToken);

        DataTypes.Supplier storage supplier = suppliersByAddress[_receiver];
        DataTypes.PoolV2 storage pool = poolByTimestamp[block.timestamp];
        uint256 userBalance = sToken.balanceOf(_receiver);
        uint256 minBalance = supplier.outStream.minBalance;
        uint256 stepAmount = (uint96(supplier.outStream.flow)) * (supplier.outStream.stepTime);

        ////// user balance goes below min balance, stream will be stopped and all funds will be returned
        if (userBalance < minBalance) {
            console.log("XXXXXXXXXXXXX 696 XXXXXXXXXXXX");
            _cancelFlow(_receiver, userBalance, minBalance);
        } else {
            _withdrawDispatcher(_receiver, address(poolContract), stepAmount);

            pool.deposit = pool.deposit.sub(stepAmount.mul(PRECISSION));

            supplier.deposit = supplier.deposit.sub(stepAmount.mul(PRECISSION));
            supplier.outStream.initTime = block.timestamp;
        }
        emit Events.SupplierUpdate(supplier);
        bytes memory payload = abi.encode(stepAmount);
        emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW_STEP, payload, block.timestamp, _receiver);
    }

    function cancelTask(bytes32 _taskId) public {
        IOps(ops).cancelTask(_taskId);
    }

    modifier onlyPool() {
        require(msg.sender == address(poolContract), "Only Pool");
        _;
    }

    modifier onlyPoolStrategy() {
        require(msg.sender == address(poolStrategy), "Only Strategy");
        _;
    }

    modifier onlySToken() {
        require(msg.sender == address(sToken), "Only Superpool Token");
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

    /**************************************************************************
     * INTERNAL HELPERS
     *************************************************************************/
    function parseLoanData(bytes memory data) public pure returns (uint256 endSeconds) {
        endSeconds = abi.decode(data, (uint256));
    }
}
