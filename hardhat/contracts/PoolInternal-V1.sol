//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {UUPSProxiable} from "./upgradability/UUPSProxiable.sol";

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {ISuperToken, ISuperfluid} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";

import {IOps} from "./gelato/IOps.sol";
import {LibDataTypes} from "./gelato/LibDataTypes.sol";

import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import {IPoolV1} from "./interfaces/IPool-V1.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";
import {PoolStateV1} from "./PoolState-V1.sol";

contract PoolInternalV1 is UUPSProxiable, PoolStateV1 {
     using SafeMath for uint256;
     using CFAv1Library for CFAv1Library.InitData;


    // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //

    function _tokensReceived(address _supplier, uint256 amount) external onlyPool {
        ///// suppler config updated && pool

        _updateSupplierDeposit(_supplier, amount, 0);
        _balanceTreasury();
    }

    function _redeemDeposit(address _supplier,uint256 redeemAmount) external onlyPool {
        uint256 balance = _getSupplierBalance(_supplier);

        require(balance >= redeemAmount, "NOT_ENOUGH_BALANCE");

        _updateSupplierDeposit(_supplier, 0, redeemAmount);

        _withdrawTreasury(_supplier, _supplier, redeemAmount);
    }

    function _redeemFlow(address _supplier,int96 _outFlowRate) external onlyPool {


        bytes memory placeHolder = "0x";

        _updateSupplierFlow(_supplier, 0, _outFlowRate, placeHolder);
    }

    function _redeemFlowStop(address _supplier) external onlyPool {
        _updateSupplierFlow(_supplier, 0, 0, "0x");
        _balanceTreasury();
    }

    function _closeAccount() external onlyPool {}



    // #endregion User Interaction PoolEvents

    // #region =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //





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

        if (periodSpan > 0) {
            poolId++;

            DataTypes.PoolV1 memory pool = DataTypes.PoolV1(poolId, block.timestamp, 0, 0, 0, 0, 0, 0, 0, DataTypes.Yield(0, 0, 0, 0, 0, 0, 0), DataTypes.APY(0, 0));

            pool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;
            pool.depositFromOutFlowRate = uint96(lastPool.outFlowRate) * PRECISSION * periodSpan + lastPool.depositFromOutFlowRate;

            pool.deposit = lastPool.deposit;

            pool.nrSuppliers = supplierId;

            pool.yieldObject.yieldSnapshot = currentYieldSnapshot;
            uint256 periodAccrued = pool.yieldObject.yieldSnapshot - lastPool.yieldObject.yieldSnapshot;
            pool.yieldObject.protocolYield = lastPool.yieldObject.protocolYield + periodAccrued.mul(PROTOCOL_FEE).div(100);

            pool.yieldObject.yieldAccrued = periodAccrued.mul(100 - PROTOCOL_FEE).div(100);

            pool.yieldObject.totalYield = lastPool.yieldObject.totalYield + pool.yieldObject.yieldAccrued;

            /// apy to be refined
            pool.apy.span = lastPool.apy.span + periodSpan;

            uint256 periodBalance = lastPool.deposit.add(lastPool.depositFromInFlowRate).add(lastPool.outFlowBuffer);

            uint256 periodApy = periodBalance == 0 ? 0 : pool.yieldObject.yieldAccrued.mul(365 * 24 * 3600 * 100).div(periodBalance);

            pool.apy.apy = ((periodApy).add(lastPool.apy.span.mul(lastPool.apy.apy))).div(pool.apy.span);

            (pool.yieldObject.yieldTokenIndex, pool.yieldObject.yieldInFlowRateIndex, pool.yieldObject.yieldOutFlowRateIndex) = _calculateIndexes(pool.yieldObject.yieldAccrued, lastPool);
            pool.yieldObject.yieldTokenIndex = pool.yieldObject.yieldTokenIndex + lastPool.yieldObject.yieldTokenIndex;
            pool.yieldObject.yieldInFlowRateIndex = pool.yieldObject.yieldInFlowRateIndex + lastPool.yieldObject.yieldInFlowRateIndex;
            pool.yieldObject.yieldOutFlowRateIndex = pool.yieldObject.yieldOutFlowRateIndex + lastPool.yieldObject.yieldOutFlowRateIndex;
            pool.inFlowRate = lastPool.inFlowRate;
            pool.outFlowRate = lastPool.outFlowRate;
            pool.outFlowBuffer = lastPool.outFlowBuffer;

            pool.timestamp = block.timestamp;
            poolByTimestamp[block.timestamp] = pool;

            lastPoolTimestamp = block.timestamp;
        }

        console.log("pool_update");
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
        }

        return supplier;
    }


 



    function _getSupplierBalance(address _supplier) internal view returns (uint256 realtimeBalance) {
        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        uint256 yieldSupplier = totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

        int96 netFlow = supplier.inStream - supplier.outStream.flow;

        if (netFlow >= 0) {
            realtimeBalance = yieldSupplier + (supplier.deposit) + uint96(netFlow) * (block.timestamp - supplier.timestamp) * PRECISSION;
        } else {
            realtimeBalance = yieldSupplier + (supplier.deposit) - uint96(supplier.outStream.flow) * (block.timestamp - supplier.timestamp) * PRECISSION;
        }
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

        if (supplier.outStream.flow > 0) {
            cancelTask(supplier.outStream.cancelWithdrawId);
            if (outDeposit > 0) {
                uint256 balance = _getSupplierBalance(_supplier).sub(outDeposit);
                uint256 outFlowBuffer = POOL_BUFFER.mul(uint96(supplier.outStream.flow));
                uint256 initialWithdraw = SUPERFLUID_DEPOSIT.mul(uint96(supplier.outStream.flow));
                uint256 streamDuration = balance.sub(outFlowBuffer.add(initialWithdraw)).div(uint96(supplier.outStream.flow));

                require(streamDuration >= 24 * 3600, "NOT_ENOUGH_BALANCE_WITH_OUTFLOW");
                supplier.outStream.streamDuration = streamDuration;
                supplier.outStream.streamInit = block.timestamp;
                suppliersByAddress[_supplier].outStream.cancelWithdrawId = _createCloseStreamTask(_supplier, streamDuration);
            } else if (inDeposit > 0) {
                uint256 currentEndTime = supplier.outStream.streamInit + supplier.outStream.streamDuration;
                uint256 addTime = inDeposit.div(uint96(supplier.outStream.flow));
                supplier.outStream.streamDuration = supplier.outStream.streamDuration.add(addTime);
                supplier.outStream.cancelWithdrawId = _createCloseStreamTask(_supplier, currentEndTime.add(addTime).sub(block.timestamp));
            }
        }

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

        _poolUpdate();

        _supplierUpdateCurrentState(_supplier);

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
                    _cfaLib.deleteFlow(address(this), _supplier, superToken);
                } else {
                    newCtx = _cfaLib.deleteFlowWithCtx(_ctx, address(this), _supplier, superToken);
                }

                _cancelTask(supplier.outStream.cancelWithdrawId);
                uint256 oldOutFlowBuffer = POOL_BUFFER.mul(uint96(-currentNetFlow));
                pool.outFlowBuffer -= oldOutFlowBuffer;
                supplier.outStream = DataTypes.OutStream(0, 0, 0, bytes32(0));
                _balanceTreasury();
            } else {
                pool.outFlowRate = pool.outFlowRate + currentNetFlow - newNetFlow;

                _outStreamHasChanged(_supplier, -newNetFlow);
            }
        } else {
            /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

            if (newNetFlow >= 0) {
                pool.inFlowRate = pool.inFlowRate - currentNetFlow + inFlow;

                _balanceTreasury();
            } else {
                /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW NEGATIVE

                if (currentNetFlow > 0) {
                    _cfaLib.deleteFlow(_supplier, address(this), superToken);
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
        _transfer(fee, feeToken);
        _balanceTreasury();
    }

    function _balanceTreasury() public {
        lastExecution = block.timestamp;

        (int256 balance, , , ) = superToken.realtimeBalanceOfNow(address(this));
        if (balance > 0) {} else {}
        DataTypes.PoolV1 storage currentPool = poolByTimestamp[lastPoolTimestamp];

        console.log(545, uint256(balance));

        uint256 currentThreshold = currentPool.outFlowBuffer;

        int96 netFlow = currentPool.inFlowRate - currentPool.outFlowRate;
        if (netFlow < 0) {
            currentThreshold = currentThreshold + ((BALANCE_TRIGGER_TIME)) * uint96(-netFlow);
        }

        console.log(556, currentThreshold);

        if (uint256(balance) > currentThreshold) {
            uint256 toDeposit = uint256(balance) - currentThreshold;
            console.log(567, toDeposit);
            poolStrategy.pushToStrategy(toDeposit);
            currentPool.yieldObject.yieldSnapshot += toDeposit;
        } else if (currentThreshold > uint256(balance)) {
            uint256 amountToWithdraw = currentThreshold - uint256(balance);

            uint256 balanceAave = poolStrategy.balanceOf();

            if (amountToWithdraw > balanceAave) {
                amountToWithdraw = balanceAave;
            }
            console.log(567, amountToWithdraw);
            poolStrategy.withdraw(amountToWithdraw, address(this));
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

        if (netFlow < 0) {
            currentThreshold = currentThreshold + (BALANCE_TRIGGER_TIME) * uint96(-netFlow);
        }
        //// calculate if any remaining balance of supertokens is inthe pool (push to strategy not yet ran)
        uint256 poolAvailable = 0;
        if (superToken.balanceOf(address(this)) > (currentThreshold)) {
            poolAvailable = superToken.balanceOf(address(this)) - (currentThreshold);
        }

        //// if enough in the pool is available then not go to the pool strategy
        if (poolAvailable >= withdrawAmount) {
            //// if the withdrawal is to supplier then we must transfer

            if (_supplier == _receiver) {
                IERC20(address(superToken)).transfer(_receiver, withdrawAmount);
            }

            if (poolAvailable > withdrawAmount) {
                poolStrategy.pushToStrategy(poolAvailable - withdrawAmount);
                pool.yieldObject.yieldSnapshot += poolAvailable - withdrawAmount;
            }

            //// in the case the withdraw receiver is the pool, we don0t have to do anything as there is enoguh balance
        } else {
            //// not enough balance then we must withdraw from gtrategy

            uint256 balance = poolStrategy.balanceOf();

            uint256 fromStrategy = withdrawAmount - poolAvailable;

            uint256 correction;
            if (fromStrategy > balance) {
                correction = fromStrategy - balance;

                if (balance > 0) {
                    poolStrategy.withdraw(balance, _receiver);
                    console.log(637, balance);
                    pool.yieldObject.yieldSnapshot = pool.yieldObject.yieldSnapshot - balance;
                }

                if (_supplier == _receiver) {
                 
                    IERC20(address(superToken)).transfer(_receiver, correction);
                }
            } else {
                console.log(645, fromStrategy);
                poolStrategy.withdraw(fromStrategy, _receiver);
                pool.yieldObject.yieldSnapshot = pool.yieldObject.yieldSnapshot - fromStrategy;
                IERC20(address(superToken)).transfer(_receiver, poolAvailable);
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

        uint256 userBalance = _getSupplierBalance(_supplier);

        uint256 outFlowBuffer = POOL_BUFFER.mul(uint96(newOutFlow));
        uint256 initialWithdraw = SUPERFLUID_DEPOSIT.mul(uint96(newOutFlow));
        uint256 streamDuration = userBalance.sub(outFlowBuffer.add(initialWithdraw)).div(uint96(newOutFlow));

        console.log("Initial_withdraw", initialWithdraw);

        if (supplier.outStream.flow == 0) {
            if (streamDuration < 24 * 3600) {
                revert("No sufficent funds");
            }

            pool.outFlowBuffer += outFlowBuffer;
            supplier.outStream.cancelWithdrawId = _createCloseStreamTask(_supplier, streamDuration);
            supplier.outStream.streamInit = block.timestamp;
            _withdrawTreasury(_supplier, address(this), initialWithdraw);
            supplier.outStream.streamDuration = streamDuration;
            _cfaLib.createFlow(_supplier, superToken, newOutFlow);

        } else if (supplier.outStream.flow > 0 && supplier.outStream.flow != newOutFlow) {
            if (streamDuration < 24 * 3600) {
                revert("No sufficent funds");
            }
            _cancelTask(supplier.outStream.cancelWithdrawId);

            supplier.outStream.cancelWithdrawId = _createCloseStreamTask(_supplier, streamDuration);
            supplier.outStream.streamDuration = streamDuration;
            supplier.outStream.streamInit = block.timestamp;

            if (supplier.outStream.flow > newOutFlow) {
                uint256 decreaseBuffer = POOL_BUFFER.mul(uint96(supplier.outStream.flow - newOutFlow));

                pool.outFlowBuffer -= decreaseBuffer;
                _balanceTreasury();
            } else {
                uint256 increaseBuffer = POOL_BUFFER.mul(uint96(newOutFlow - supplier.outStream.flow));
                pool.outFlowBuffer += increaseBuffer;
                uint256 oldInitialWithdraw = SUPERFLUID_DEPOSIT.mul(uint96(supplier.outStream.flow));
                uint256 toWithDraw = increaseBuffer + initialWithdraw - oldInitialWithdraw;
                console.log(707, toWithDraw);
                _withdrawTreasury(_supplier, address(this), toWithDraw);
                //To DO REBALANCE
            }
         
            _cfaLib.updateFlow(_supplier, superToken, newOutFlow);
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
        _poolUpdate();
        _supplierUpdateCurrentState(_supplier);

        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

        //// TODO clsoe stream transfer yield accrued while dscending
        uint256 userBalance = _getSupplierBalance(_supplier);

        uint256 oldOutFlowBuffer = POOL_BUFFER.mul(uint96(supplier.outStream.flow));
        pool.outFlowBuffer -= oldOutFlowBuffer;
        pool.outFlowRate -= supplier.outStream.flow;
        pool.deposit -= supplier.deposit;

        supplier.deposit = 0;
        supplier.outStream = DataTypes.OutStream(0, 0, 0, bytes32(0));


         _cfaLib.deleteFlow(address(this), _supplier, superToken);
        _withdrawTreasury(_supplier, _supplier, userBalance);
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
        bytes memory payload = abi.encode(amount);
        emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW, payload, block.timestamp, address(0));

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

    function _transfer(uint256 _amount, address _paymentToken) internal {
        (bool success, ) = gelato.call{value: _amount}("");
        require(success, "_transfer: ETH transfer failed");
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
        require(msg.sender == address(this), "Only Pool");
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
