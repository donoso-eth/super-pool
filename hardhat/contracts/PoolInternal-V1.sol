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

  uint256 public lastPoolTimestamp;

  uint256 public PRECISSION;
  // 1 hour minimum flow == Buffer
  uint8 public STEPS; // proportinal decrease deposit
  uint256 public POOL_BUFFER; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
  uint256 public SUPERFLUID_DEPOSIT;
  uint256 public MIN_OUTFLOW_ALLOWED;
  uint256 public PROTOCOL_FEE;
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
    poolByTimestamp[block.timestamp] = DataTypes.PoolV1(0, block.timestamp, 0, 0, 0, 0, 0, 0, DataTypes.Yield(0, 0, 0, 0, 0, 0), DataTypes.APY(0, 0));

    poolTimestampById[0] = block.timestamp;

    PRECISSION = poolContract.getPrecission();
    PROTOCOL_FEE = poolContract.getProtocolFee();

    STEPS = poolContract.getSteps();
    SUPERFLUID_DEPOSIT = poolContract.getSuperfluidDeposit();
    POOL_BUFFER = poolContract.getPoolBuffer();
    MIN_OUTFLOW_ALLOWED = 3600;
  }

  // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //

  function _tokensReceived(address from, uint256 amount) external onlyPool {
    ///// suppler config updated && pool
    _updateSupplierDeposit(from, amount, 0);
  }

  function _redeemDeposit(uint256 redeemAmount, address _supplier) external onlyPool {
    _updateSupplierDeposit(_supplier, 0, redeemAmount);

    _withdrawDispatcher(_supplier, _supplier, redeemAmount);
  }

  function _redeemFlow(int96 _outFlowRate, address _supplier) external onlyPool {
    uint256 realTimeBalance = poolContract.balanceOf(_supplier);

    require(realTimeBalance > 0, "NO_BALANCE");

    bytes memory placeHolder = "0x";

    _updateSupplierFlow(_supplier, 0, _outFlowRate, placeHolder);
  }

  function _redeemFlowStop(address _supplier) external onlyPool {
    _updateSupplierFlow(_supplier, 0, 0, "0x");
  }

  function _closeAccount() external onlyPool {}

  function updateStreamRecord(
    bytes memory newCtx,
    int96 inFlowRate,
    address sender
  ) external onlyPool returns (bytes memory updateCtx) {
    updateCtx = _updateSupplierFlow(sender, inFlowRate, 0, newCtx);
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

    (uint256 yieldTokenIndex, uint256 yieldInFlowRateIndex) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

    DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

    uint256 yieldDeposit = yieldTokenIndex * supplier.deposit.div(PRECISSION);
    uint256 yieldInFlow = uint96(supplier.inStream) * yieldInFlowRateIndex;

    yieldSupplier = yieldTilllastPool + yieldDeposit + yieldInFlow;
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

    if (periodSpan > 0) {
      poolId++;

      DataTypes.PoolV1 memory pool = DataTypes.PoolV1(poolId, block.timestamp, 0, 0, 0, 0, 0, 0, DataTypes.Yield(0, 0, 0, 0, 0, 0), DataTypes.APY(0, 0));

      pool.depositFromInFlowRate = uint96(lastPool.inFlowRate) * PRECISSION * periodSpan + lastPool.depositFromInFlowRate;

      pool.deposit = lastPool.deposit;

      pool.nrSuppliers = supplierId;

      pool.yieldObject.yieldSnapshot = currentYieldSnapshot;

      uint256 periodAccrued = pool.yieldObject.yieldSnapshot - lastPool.yieldObject.yieldSnapshot;

      pool.yieldObject.protocolYield = pool.yieldObject.protocolYield.mul(PROTOCOL_FEE);

      pool.yieldObject.yieldAccrued = periodAccrued.mul(100 - PROTOCOL_FEE).div(100);

      pool.yieldObject.totalYield = lastPool.yieldObject.totalYield + pool.yieldObject.yieldAccrued;

      /// apy to be refined
      pool.apy.span = lastPool.apy.span + periodSpan;

      uint256 periodBalance = lastPool.deposit.add(lastPool.depositFromInFlowRate).add(lastPool.outFlowBuffer);
      console.log(207,periodBalance);

      uint256 periodApy = periodBalance == 0 ? 0 : pool.yieldObject.yieldAccrued.mul(365 * 24 * 3600 * 100).div(periodBalance);

    console.log(208,periodApy);

      pool.apy.apy = ((periodApy).add(lastPool.apy.span.mul(lastPool.apy.apy))).div(pool.apy.span);

      (pool.yieldObject.yieldTokenIndex, pool.yieldObject.yieldInFlowRateIndex) = _calculateIndexes(pool.yieldObject.yieldAccrued, lastPool);

      pool.yieldObject.yieldTokenIndex = pool.yieldObject.yieldTokenIndex + lastPool.yieldObject.yieldTokenIndex;
      pool.yieldObject.yieldInFlowRateIndex = pool.yieldObject.yieldInFlowRateIndex + lastPool.yieldObject.yieldInFlowRateIndex;

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

  function _calculateIndexes(uint256 yieldPeriod, DataTypes.PoolV1 memory lastPool) public view returns (uint256 periodYieldTokenIndex, uint256 periodYieldInFlowRateIndex) {
    uint256 periodSpan = block.timestamp - lastPool.timestamp;

    uint256 dollarSecondsInFlow = ((uint96(lastPool.inFlowRate) * (periodSpan**2)) * PRECISSION) / 2 + lastPool.depositFromInFlowRate * periodSpan;
    uint256 dollarSecondsDeposit = lastPool.deposit * periodSpan;

    uint256 totalAreaPeriod = dollarSecondsDeposit + dollarSecondsInFlow;

    /// we ultiply by PRECISSION

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

    yieldSupplier = yieldFromDeposit;
    if (supplier.inStream > 0) {
      ///// Yield from flow
      yieldFromFlow = uint96(supplier.inStream) * (lastPool.yieldObject.yieldInFlowRateIndex - supplierPool.yieldObject.yieldInFlowRateIndex);
    }
    yieldSupplier = yieldSupplier + yieldFromFlow;
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
   *              b) ensure Supertokens are available to cover the step in the pool, if not _withdrawDispatcher()
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
          poolContract.sfDeleteFlow(address(poolContract), _supplier);
        } else {
          newCtx = poolContract.sfDeleteFlowWithCtx(_ctx, address(poolContract), _supplier);
        }

        _cancelTask(supplier.outStream.cancelWithdrawId);
        uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.outFlowBuffer = pool.outFlowBuffer - supplier.outStream.minBalance;
        supplier.outStream = DataTypes.OutStream(0, 0, 0, 0, 0, bytes32(0));
      } else {
        pool.outFlowRate = pool.outFlowRate + currentNetFlow - newNetFlow;

        //   pool.deposit = pool.deposit - supplier.deposit;

        //// creatre timed task
        _outStreamHasChanged(_supplier, -newNetFlow);
      }
    } else {
      /// PREVIOUS FLOW NOT EXISTENT OR POSITIVE AND CURRENT FLOW THE SAME

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

        _outStreamHasChanged(_supplier, -newNetFlow);
      }
    }

    supplier.inStream = inFlow;
    supplier.outStream.flow = outFlow;
  }

  // #endregion

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
    uint256 stepTime = userBalance.div(uint256(STEPS)).div(uint96(newOutFlow));
    uint256 stepAmount = (uint96(newOutFlow)) * (stepTime);
    uint256 minBalance = stepAmount.add((POOL_BUFFER.add(SUPERFLUID_DEPOSIT)).mul(uint96(newOutFlow)));

    if (supplier.outStream.flow == 0) {
      if (userBalance < minBalance) {
        revert("No sufficent funds");
      }
      _createOutStream(_supplier, minBalance, 0, stepAmount, stepTime);
      poolContract.sfCreateFlow(_supplier, newOutFlow);
    } else if (supplier.outStream.flow > 0) {
      if (userBalance < minBalance) {
        _cancelOutstreamFlow(_supplier, userBalance, minBalance);
      } else if (supplier.outStream.flow != newOutFlow) {
        _cancelTask(supplier.outStream.cancelWithdrawId);

        uint256 alreadyStreamed = uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime);
        supplier.deposit = supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.deposit = pool.deposit + supplier.outStream.minBalance.mul(PRECISSION) - alreadyStreamed.mul(PRECISSION);
        pool.outFlowBuffer = pool.outFlowBuffer - supplier.outStream.minBalance;
        _createOutStream(_supplier, minBalance, supplier.outStream.minBalance, stepAmount, stepTime);
        poolContract.sfUpdateFlow(_supplier, newOutFlow);
      }
    }
  }

  /**
   * @notice internal call from updteSupplierFlow() when a redeemflow has been started or updated
   *
   * @param _supplier supplier's address
   * @param newMinBalance  new minimal balance
   * @param prevoiusMinBalance in case a flow existed, the previous minbalance has to be rebalanced
   * @param stepAmount the amount to transfer in each step to ensure enough balance of supertokens
   * @param stepTime time to next step
   *
   * @dev  the record is created, worth notifying that if the new minBalaance is greated
   *       the _withdrawDispatcher() will be called
   */
  function _createOutStream(
    address _supplier,
    uint256 newMinBalance,
    uint256 prevoiusMinBalance,
    uint256 stepAmount,
    uint256 stepTime
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

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

    supplier.outStream.cancelWithdrawId = _createWithdraStepTask(_supplier, supplier.outStream.stepTime);
  }

  /**
   * @notice internal call from updteSupplierFlow() when a redeemflow has been started or updated
   *
   * @param _supplier supplier's address
   * @param minBalance  new minimal balance
   * @param userBalance  user current balance
   *
   * @dev  the outstream will be cancel when the withdrawset gelato task is in the last step
   *       or when the redeem flow has been updated and there is no wnough minimal balance
   */
  function _cancelOutstreamFlow(
    address _supplier,
    uint256 userBalance,
    uint256 minBalance
  ) internal {
    DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

    _cancelTask(supplier.outStream.cancelWithdrawId);

    pool.outFlowBuffer = pool.outFlowBuffer - minBalance;
    _withdrawDispatcher(_supplier, _supplier, userBalance);
    pool.deposit = pool.deposit - userBalance;
    pool.outFlowRate = pool.outFlowRate - supplier.outStream.flow;
    supplier.deposit = 0;
    supplier.outStream = DataTypes.OutStream(0, 0, 0, 0, 0, bytes32(0));
  }

  // #endregion  ============= =============  Internal Stream Functions ============= ============= //

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
  function _withdrawDispatcher(
    address _supplier,
    address _receiver,
    uint256 withdrawAmount
  ) internal {
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];

    //// calculate if any remaining balance of supertokens is inthe pool (push to strategy not yet ran)
    uint256 poolAvailable = 0;
    if (superToken.balanceOf(address(poolContract)) > (pool.outFlowBuffer)) {
      poolAvailable = superToken.balanceOf(address(poolContract)) - (pool.outFlowBuffer);
    }

    //// if enough in the pool is available then not go to the pool strategy
    if (poolAvailable >= withdrawAmount) {
      //// if the withdrawal is to supplier then we must transfer
      console.log("NOT PUSHED");
      if (_supplier == _receiver) {
        poolContract.transferSuperToken(_receiver, withdrawAmount);
      }
      //// in the case the withdraw receiver is the pool, we don0t have to do anything as there is enoguh balance
    } else {
      //// not enough balance then we must withdraw from gtrategy
      console.log("YES PUSHED");
      uint256 balance = poolStrategy.balanceOf();

      uint256 fromStrategy = withdrawAmount - poolAvailable;

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
      }
    }
  }

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
  }

  // #endregion  ============= =============  ERC20  ============= ============= //

  // #region ====================  Gelato Withdraw Step Task  ====================

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
    DataTypes.PoolV1 storage pool = poolByTimestamp[block.timestamp];
    uint256 userBalance = poolContract.balanceOf(_receiver);
    uint256 minBalance = supplier.outStream.minBalance;
    uint256 stepAmount = (uint96(supplier.outStream.flow)) * (supplier.outStream.stepTime);

    ////// user balance goes below min balance, stream will be stopped and all funds will be returned
    if (userBalance < minBalance) {
      _cancelOutstreamFlow(_receiver, userBalance, minBalance);
    } else {
      _withdrawDispatcher(_receiver, address(poolContract), stepAmount);

      pool.deposit = pool.deposit.sub(stepAmount.mul(PRECISSION));

      supplier.deposit = supplier.deposit.sub(stepAmount.mul(PRECISSION));
      supplier.outStream.initTime = block.timestamp;
    }

    poolContract.internalWithDrawStep(_receiver, stepAmount);
  }

  function cancelTask(bytes32 _taskId) public {
    IOps(ops).cancelTask(_taskId);
  }

  function _cancelTask(bytes32 taskId) internal {
    IOps(ops).cancelTask(taskId);
  }

  function _createWithdraStepTask(address _supplier, uint256 _stepTime) internal returns (bytes32 taskId) {
    bytes memory timeArgs = abi.encode(uint128(block.timestamp + _stepTime), _stepTime);

    bytes memory execData = abi.encodeWithSelector(this.withdrawStep.selector, _supplier);

    LibDataTypes.Module[] memory modules = new LibDataTypes.Module[](1);

    modules[0] = LibDataTypes.Module.TIME;

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
