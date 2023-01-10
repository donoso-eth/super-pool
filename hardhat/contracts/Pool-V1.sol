//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";


import "@openzeppelin/contracts/utils/math/SafeMath.sol";

import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {UUPSProxiable} from "./upgradability/UUPSProxiable.sol";
import {Initializable} from "@openzeppelin/contracts/proxy/utils/Initializable.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";
import {LibDataTypes} from "./gelato/LibDataTypes.sol";

import {IPoolV1} from "./interfaces/IPool-V1.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";
import {PoolStateV1} from "./PoolState-V1.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

/**
 *
 * @title Pool Implmentation (User=supplier interaction)
 * @dev This contract provides the ability to send supertokens via single transactions or streaming.
 *      The state within the contract will be updated every time a "pool event"
 *      (yield accrued updated, start/stop stream/ deposit/withdraw, ertc..) happen. Every pool event
 *      a new pool state will be stored
 *
 *      The supplier interact with this contract. The state and the logic is inside a contract PoolInternal.
 *      After a pool envent is trigerred the pool contract call a "twin" method in the pool internal contract
 *
 *      The update Process follows:
 *      1) Pool Contract: Pool Events (external triggered)
 *      2) Pool Internal Contract: Pool Update, Pool state updated, index calculations from previous pool
 *      3) Pool Internal Contract: Supplier Update State (User deòsitimg/withdrawing, etc.. )
 *      4) Pool Internal Contract:New created pool updated
 *
 *
 */
contract PoolV1 is
    PoolStateV1,
    Initializable,
    UUPSProxiable,
    SuperAppBase,
    IERC777Recipient,
    IPoolV1,
    IERC20
{
    using SafeMath for uint256;
    using CFAv1Library for CFAv1Library.InitData;

    /**
     * @notice initializer of the Pool
     */
    function initialize(DataTypes.PoolInitializer memory poolInit)
        external
        initializer
    {
        ///initialState

        _name = poolInit.name;
        _symbol = poolInit.symbol;
        //// super app && superfluid
        host = poolInit.host;
        owner = poolInit.owner;
        superToken = poolInit.superToken;

        cfa = IConstantFlowAgreementV1(
            address(
                host.getAgreementClass(
                    keccak256(
                        "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
                    )
                )
            )
        );
        token = poolInit.token;
        owner = poolInit.owner;
        poolFactory = msg.sender;

        //MAX_INT = 2 ** 256 - 1;

        _cfaLib = CFAv1Library.InitData(host, cfa);

        //// tokens receie implementation
        IERC1820Registry _erc1820 = IERC1820Registry(
            0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24
        );
        bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256(
            "ERC777TokensRecipient"
        );

        _erc1820.setInterfaceImplementer(
            address(this),
            TOKENS_RECIPIENT_INTERFACE_HASH,
            address(this)
        );

        ///// initializators

        ops = poolInit.ops;
        gelato = ops.gelato();

        // PRECISSION = 1_000_000;
        // MIN_OUTFLOW_ALLOWED = 24 * 3600; // 1 Day minimum flow == Buffer

        //POOL_BUFFER = 3600; // buffer to keep in the pool (outstream 4hours deposit) + outstream partial deposits
        //SUPERFLUID_DEPOSIT = 4 * 3600;

        // DEPOSIT_TRIGGER_AMOUNT = 100 ether;
        // BALANCE_TRIGGER_TIME = 3600 * 24;

        //PROTOCOL_FEE = 3;

        poolStrategy = address(poolInit.poolStrategy);
        poolInternal = poolInit.poolInternal;

        token.approve(address(poolStrategy), MAX_INT);
        superToken.approve(address(poolStrategy), MAX_INT);

        lastPoolTimestamp = block.timestamp;
        poolByTimestamp[block.timestamp].timestamp = block.timestamp;

        bytes memory data = callInternal(
            abi.encodeWithSignature("_createBalanceTreasuryTask()")
        );

        balanceTreasuryTask = abi.decode(data, (bytes32)); // createBalanceTreasuryTask();
    }

    // #region ============ ===============  PUBLIC VIEW FUNCTIONS  ============= ============= //

    function getSupplier(address _supplier)
        external
        view
        returns (DataTypes.Supplier memory supplier)
    {
        supplier = suppliersByAddress[_supplier];
    }

    function getPool(uint256 timestamp)
        external
        view
        returns (DataTypes.Pool memory pool)
    {
        pool = poolByTimestamp[timestamp];
    }

    function getLastPool() external view returns (DataTypes.Pool memory pool) {
        pool = poolByTimestamp[lastPoolTimestamp];
    }

    function getLastTimestamp() external view returns (uint256) {
        return lastPoolTimestamp;
    }

    function getVersion() external pure returns (uint256) {
        return 1;
    }

    // #endregion =========== =============  PUBLIC VIEW FUNCTIONS  ============= ============= //

    // #region ============ ===============  EXTERNAL (SUPPLIER INTERACTION) ============= ============= //
    /**
     *
     * @notice Supplier (User) interaction
     * @dev Following interactions are expected:
     *
     * ---- tokensReceived()
     *      implementation callback tokensReceived(). Deposit funds via erc777.send() function.
     *
     * ---- redeemDeposit() User withdraw funds from his balalce SuperTokens will be ransfered
     *
     * ---- redeemFlow() User request a stream from the pool (this balance will be reduced)
     *
     * ---- redeemFlowStop() User stops receiving stream from the pool
     *
     * ---- closeAcount User receives the complete balance and streams will be closed //TODO
     *
     *
     */

    /**
     * @notice ERC277 call back allowing deposit tokens via .send()
     * @param from Supplier (user sending tokens)
     * @param amount amount received
     */
    function tokensReceived(
        address,
        address from,
        address,
        uint256 amount,
        bytes calldata,
        bytes calldata
    ) external override(IERC777Recipient, IPoolV1) onlyNotEmergency {
        require(msg.sender == address(superToken), "INVALID_TOKEN");
        require(amount > 0, "AMOUNT_TO_BE_POSITIVE");

        callInternal(
            abi.encodeWithSignature(
                "_tokensReceived(address,uint256)",
                from,
                amount
            )
        );

        emitEvents(from);

        bytes memory payload = abi.encode(amount);
        emit Events.SupplierEvent(
            DataTypes.SupplierEvent.DEPOSIT,
            payload,
            block.timestamp,
            from
        );
    }

    /**
     * @notice User redeem deposit (withdraw)
     * @param redeemAmount amount to be reddemed
     */
    function redeemDeposit(uint256 redeemAmount)
        external
        override
        onlyNotEmergency
    {
        address _supplier = msg.sender;

        callInternal(
            abi.encodeWithSignature(
                "_redeemDeposit(address,uint256)",
                _supplier,
                redeemAmount
            )
        );

        emitEvents(_supplier);

        bytes memory payload = abi.encode(redeemAmount);
        emit Events.SupplierEvent(
            DataTypes.SupplierEvent.WITHDRAW,
            payload,
            block.timestamp,
            _supplier
        );
    }

    /**
     * @notice User starts a flow to be
     * @param _outFlowRate outflowrate to receive from the pool
     *
     *    This method can be called to create a stream or update a previous one
     */
    function redeemFlow(int96 _outFlowRate) external onlyNotEmergency {
        address _supplier = msg.sender;

        uint256 realTimeBalance = balanceOf(_supplier);

        ///
        require(realTimeBalance > 0, "NO_BALANCE");

        DataTypes.SupplierEvent flowEvent = suppliersByAddress[_supplier]
            .outStream
            .flow > 0
            ? DataTypes.SupplierEvent.OUT_STREAM_UPDATE
            : DataTypes.SupplierEvent.OUT_STREAM_START;

        callInternal(
            abi.encodeWithSignature(
                "_redeemFlow(address,int96)",
                _supplier,
                _outFlowRate
            )
        );

        emitEvents(_supplier);

        bytes memory payload = abi.encode(_outFlowRate);
        emit Events.SupplierEvent(
            flowEvent,
            payload,
            block.timestamp,
            _supplier
        );
    }

    function taskClose(address _supplier) external onlyNotEmergency onlyOps {
        (uint256 fee, address feeToken) = IOps(ops).getFeeDetails();

        transfer(fee, feeToken);
        callInternal(
            abi.encodeWithSignature("closeStreamFlow(address)", _supplier)
        );
    }

    /**
     * @notice User stop the receiving stream
     *
     */
    function redeemFlowStop() external onlyNotEmergency {
        address _supplier = msg.sender;

        require(
            suppliersByAddress[_supplier].outStream.flow > 0,
            "OUT_STREAM_NOT_EXISTS"
        );

        callInternal(
            abi.encodeWithSignature("_redeemFlowStop(address)", _supplier)
        );

        emitEvents(_supplier);

        bytes memory payload = abi.encode("");
        emit Events.SupplierEvent(
            DataTypes.SupplierEvent.OUT_STREAM_STOP,
            payload,
            block.timestamp,
            _supplier
        );
    }

    /**
     * @notice User withdraw all funds and close streams
     *
     */
    function closeAccount() external {}

    // #endregion User Interaction PoolEvents

    // #region ============ ===============  SUPERFLUID  ============= =============
    function afterAgreementCreated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata _agreementData,
        bytes calldata, // _cbdata,
        bytes calldata _ctx
    )
        external
        override
        onlyExpected(_superToken, _agreementClass)
        onlyHost
        onlyNotEmergency
        returns (bytes memory newCtx)
    {
        newCtx = _ctx;

        (address sender, address receiver) = abi.decode(
            _agreementData,
            (address, address)
        );

        (, int96 inFlowRate, , ) = cfa.getFlow(
            superToken,
            sender,
            address(this)
        );

        //// If In-Stream we will request a pool update

        if (receiver == address(this)) {
            newCtx = _updateStreamRecord(newCtx, inFlowRate, sender);

            emitEvents(sender);
            bytes memory payload = abi.encode(inFlowRate);
            emit Events.SupplierEvent(
                DataTypes.SupplierEvent.STREAM_START,
                payload,
                block.timestamp,
                sender
            );
        }
        return newCtx;
    }

    function afterAgreementTerminated(
        ISuperToken, /*superToken*/
        address, /*agreementClass*/
        bytes32, // _agreementId,
        bytes calldata _agreementData,
        bytes calldata, /*cbdata*/
        bytes calldata _ctx
    ) external override returns (bytes memory newCtx) {
        (address sender, address receiver) = abi.decode(
            _agreementData,
            (address, address)
        );
        newCtx = _ctx;

        //// If In-Stream we will request a pool update
        if (receiver == address(this)) {
            newCtx = _updateStreamRecord(newCtx, 0, sender);
            emitEvents(sender);
            bytes memory payload = abi.encode("");
            emit Events.SupplierEvent(
                DataTypes.SupplierEvent.STREAM_STOP,
                payload,
                block.timestamp,
                sender
            );
        } else if (sender == address(this)) {
            callInternal(
                abi.encodeWithSignature("_redeemFlowStop(address)", receiver)
            );

            emitEvents(receiver);
            bytes memory payload = abi.encode("");
            emit Events.SupplierEvent(
                DataTypes.SupplierEvent.OUT_STREAM_STOP,
                payload,
                block.timestamp,
                receiver
            );
        }

        return newCtx;
    }

    function afterAgreementUpdated(
        ISuperToken _superToken,
        address _agreementClass,
        bytes32, // _agreementId,
        bytes calldata _agreementData,
        bytes calldata, //_cbdata,
        bytes calldata _ctx
    )
        external
        override
        onlyExpected(_superToken, _agreementClass)
        onlyNotEmergency
        onlyHost
        returns (bytes memory newCtx)
    {
        newCtx = _ctx;

        (address sender, address receiver) = abi.decode(
            _agreementData,
            (address, address)
        );

        (, int96 inFlowRate, , ) = cfa.getFlow(
            superToken,
            sender,
            address(this)
        );

        // If In-Stream we will request a pool update
        if (receiver == address(this)) {
            newCtx = _updateStreamRecord(newCtx, inFlowRate, sender);

            emitEvents(sender);

            bytes memory payload = abi.encode("");

            emit Events.SupplierEvent(
                DataTypes.SupplierEvent.STREAM_UPDATE,
                payload,
                block.timestamp,
                sender
            );
        }

        return newCtx;
    }

    function _updateStreamRecord(
        bytes memory newCtx,
        int96 inFlowRate,
        address sender
    ) internal returns (bytes memory updateCtx) {
        // updateCtx = _updateSupplierFlow(sender, inFlowRate, 0, newCtx);

        bytes memory data = callInternal(
            abi.encodeWithSignature(
                "_updateSupplierFlow(address,int96,int96,bytes)",
                sender,
                inFlowRate,
                0,
                newCtx
            )
        );

        updateCtx = abi.decode(data, (bytes));
    }

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return
            ISuperAgreement(agreementClass).agreementType() ==
            keccak256(
                "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
            );
    }

    function _isSameToken(ISuperToken _superToken) private view returns (bool) {
        return address(_superToken) == address(superToken);
    }

    // #endregion============= =============  SUPERFLUID  ============= =============

    // #region ============ ===============  BALANCE RREASURY =========== ==============

    function balanceTreasury() external {
        require(
            block.timestamp >= lastExecution + BALANCE_TRIGGER_TIME,
            "NOT_YET_READY"
        );

        DataTypes.Pool memory pool = poolByTimestamp[lastPoolTimestamp];

        uint256 poolBalance = superToken.balanceOf(address(this));

        require(
            pool.outFlowRate > 0 || poolBalance > DEPOSIT_TRIGGER_AMOUNT,
            "NOT_CONDITIONS"
        );

        (uint256 fee, address feeToken) = IOps(ops).getFeeDetails();

        transfer(fee, feeToken);

        callInternal(abi.encodeWithSignature("_balanceTreasuryFromGelato()"));
    }

    function checkerLastExecution()
        external
        view
        returns (bool canExec, bytes memory execPayload)
    {
        DataTypes.Pool memory pool = poolByTimestamp[lastPoolTimestamp];

        uint256 poolBalance = superToken.balanceOf(address(this));

        canExec =
            block.timestamp >= lastExecution + BALANCE_TRIGGER_TIME &&
            (pool.outFlowRate > 0 || poolBalance > DEPOSIT_TRIGGER_AMOUNT);

        execPayload = abi.encodeWithSelector(this.balanceTreasury.selector);
    }

    // #endregion ============ ===============  BALANCE RREASURY =========== ==============

    // #region ============ ===============  Internal && Pool Internal Functions   ============= ============= //

    function callInternal(bytes memory payload)
        internal
        returns (bytes memory)
    {
        (bool success, bytes memory data) = poolInternal.delegatecall(payload);

        if (!success) {
            if (data.length < 68) revert();
            assembly {
                data := add(data, 0x04)
            }
            revert(abi.decode(data, (string)));
        } else {
            return data;
        }
    }

    function transfer(uint256 _amount, address) internal {
        // _transfer(_amount, _paymentToken);
        // callInternal(abi.encodeWithSignature("_transfer(uint256,address)", _amount, _paymentToken));
        (bool success, ) = gelato.call{value: _amount}("");
        require(success, "_transfer: ETH transfer failed");
    }

    // function _transfer(uint256 _amount, address _paymentToken) internal {
    //     (bool success, ) = gelato.call{value: _amount}("");
    //     require(success, "_transfer: ETH transfer failed");
    // }

    function emitEvents(address _supplier) internal {
        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];
        emit Events.SupplierUpdate(supplier);
        DataTypes.Pool memory pool = poolByTimestamp[lastPoolTimestamp];
        emit Events.PoolUpdate(pool);
    }

    // #endregion  ============= =============  Internal && Pool Internal Functions    ============= ============= //

    // #region ============ ===============  PARAMETERS ONLY OWNER  ============= ============= //

    function setInternalContract(address _poolInternal) external onlyOwner {
        poolInternal = _poolInternal;
    }

    // #endregion =========== =============  PARAMETERS ONLY OWNER  ============= ============= //

    // #region ============ ===============  Upgradeable settings  ==================

    function proxiableUUID() public pure override returns (bytes32) {
        return keccak256("org.super-pool.pool.v2");
    }

    function updateCode(address newAddress)
        external
        override
        onlyOwnerOrPoolFactory
    {
        return _updateCodeAddress(newAddress);
    }

    // #endregion  ==================  Upgradeable settings  ==================

    // #region ============ ===============  Modifiers ============= ============= //

    modifier onlyHost() {
        require(
            msg.sender == address(host),
            "RedirectAll: support only one host"
        );
        _;
    }

    modifier onlyExpected(ISuperToken _superToken, address agreementClass) {
        require(_isSameToken(_superToken), "RedirectAll: not accepted token");
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
        _;
    }

    modifier onlyOps() {
        require(msg.sender == address(ops), "OpsReady: onlyOps");
        _;
    }

    modifier onlyOwnerOrPoolFactory() {
        require(
            msg.sender == poolFactory || msg.sender == owner,
            "Only Factory or owner"
        );
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only Owner");
        _;
    }

    modifier onlyNotEmergency() {
        require(emergency == false, "PAUSED");
        _;
    }

    // #endregion =========== =============  Modifiers ============= ============= //

    receive() external payable {
        console.log("----- receive:", msg.value);
    }

    function withdraw() external onlyOwner returns (bool) {
        (bool result, ) = payable(msg.sender).call{
            value: address(this).balance
        }("");
        return result;
    }

    /**
     * @notice Calculate the yield earned by the suplier
     * @param _supplier supplier's address
     * @return yieldSupplier uint256 yield erarnd
     *
     * @dev  it calculates the yield between the last pool update and the last supplier interaction
     *       it uses two indexes (per deosit and flow), the yield is (timespan)(diff index's)
     */
    function _calculateYieldSupplier(address _supplier)
        public
        view
        returns (uint256 yieldSupplier)
    {
        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        DataTypes.Pool memory lastPool = poolByTimestamp[lastPoolTimestamp];
        DataTypes.Pool memory supplierPool = poolByTimestamp[
            supplier.timestamp
        ];

        ///// Yield from deposit

        uint256 yieldFromDeposit = (supplier.deposit *
            (lastPool.yieldObject.yieldTokenIndex -
                supplierPool.yieldObject.yieldTokenIndex)).div(PRECISSION);
        uint256 yieldFromFlow = 0;
        uint256 yieldFromOutFlow = 0;

        yieldSupplier = yieldFromDeposit;
        if (supplier.inStream > 0) {
            ///// Yield from flow
            yieldFromFlow =
                uint96(supplier.inStream) *
                (lastPool.yieldObject.yieldInFlowRateIndex -
                    supplierPool.yieldObject.yieldInFlowRateIndex);
        }

        if (supplier.outStream.flow > 0) {
            ///// Yield from flow
            yieldFromOutFlow =
                uint96(supplier.outStream.flow) *
                (lastPool.yieldObject.yieldOutFlowRateIndex -
                    supplierPool.yieldObject.yieldOutFlowRateIndex);
        }

        yieldSupplier = yieldSupplier + yieldFromFlow - yieldFromOutFlow;
    }

    function _calculateIndexes(
        uint256 yieldPeriod,
        DataTypes.Pool memory lastPool
    )
        public
        view
        returns (
            uint256 periodYieldTokenIndex,
            uint256 periodYieldInFlowRateIndex,
            uint256 periodYieldOutFlowRateIndex
        )
    {
        // bytes memory data = callInternal(abi.encodeWithSignature("_calculateIndexes(uint256,(uint256,uint256,uint256,uint256,uint256,uint256,int96,int96,uint256,(uint256,uint256,uint256,uint256,uint256,uint256,uint256),(uint256,uint256)))", yieldPeriod, lastPool));
        // (periodYieldTokenIndex,periodYieldInFlowRateIndex,periodYieldOutFlowRateIndex) = abi.decode(data,(uint256,uint256,uint256));

        uint256 periodSpan = block.timestamp - lastPool.timestamp;

        uint256 dollarSecondsDeposit = lastPool.deposit * periodSpan;
        uint256 dollarSecondsInFlow = ((uint96(lastPool.inFlowRate) *
            (periodSpan**2)) * PRECISSION) /
            2 +
            lastPool.depositFromInFlowRate *
            periodSpan;
        uint256 dollarSecondsOutFlow = ((uint96(lastPool.outFlowRate) *
            (periodSpan**2)) * PRECISSION) /
            2 +
            lastPool.depositFromOutFlowRate *
            periodSpan;
        uint256 totalAreaPeriod = dollarSecondsDeposit +
            dollarSecondsInFlow -
            dollarSecondsOutFlow;

        /// we ultiply by PRECISSION

        if (totalAreaPeriod != 0 && yieldPeriod != 0) {
            uint256 inFlowContribution = (dollarSecondsInFlow * PRECISSION);
            uint256 outFlowContribution = (dollarSecondsOutFlow * PRECISSION);
            uint256 depositContribution = (dollarSecondsDeposit *
                PRECISSION *
                PRECISSION);
            if (lastPool.deposit != 0) {
                periodYieldTokenIndex = (
                    (depositContribution * yieldPeriod).div(
                        (lastPool.deposit) * totalAreaPeriod
                    )
                );
            }
            if (lastPool.inFlowRate != 0) {
                periodYieldInFlowRateIndex = (
                    (inFlowContribution * yieldPeriod).div(
                        uint96(lastPool.inFlowRate) * totalAreaPeriod
                    )
                );
            }
            if (lastPool.outFlowRate != 0) {
                periodYieldOutFlowRateIndex = (
                    (outFlowContribution * yieldPeriod).div(
                        uint96(lastPool.outFlowRate) * totalAreaPeriod
                    )
                );
            }
        }
    }

    function totalYieldEarnedSupplier(
        address _supplier,
        uint256 currentYieldSnapshot
    ) public view returns (uint256 yieldSupplier) {
        uint256 yieldTilllastPool = _calculateYieldSupplier(_supplier);
        DataTypes.Pool memory lastPool = poolByTimestamp[lastPoolTimestamp];

        uint256 yieldAccruedSincelastPool = 0;
        if (currentYieldSnapshot > lastPool.yieldObject.yieldSnapshot) {
            yieldAccruedSincelastPool =
                currentYieldSnapshot -
                lastPool.yieldObject.yieldSnapshot;
        }

        (
            uint256 yieldTokenIndex,
            uint256 yieldInFlowRateIndex,
            uint256 yieldOutFlowRateIndex
        ) = _calculateIndexes(yieldAccruedSincelastPool, lastPool);

        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        uint256 yieldDeposit = yieldTokenIndex *
            supplier.deposit.div(PRECISSION);
        uint256 yieldInFlow = uint96(supplier.inStream) * yieldInFlowRateIndex;
        uint256 yieldOutFlow = uint96(supplier.outStream.flow) *
            yieldOutFlowRateIndex;

        yieldSupplier =
            yieldTilllastPool +
            yieldDeposit +
            yieldInFlow -
            yieldOutFlow;
    }

    // #region ============ ===============  ERC20 implementation ============= ============= //
    function balanceOf(address _supplier)
        public
        view
        override(IPoolV1, IERC20)
        returns (uint256 balance)
    {
        balance = _getSupplierBalance(_supplier).div(PRECISSION);
    }

    function _getSupplierBalance(address _supplier)
        internal
        view
        returns (uint256 realtimeBalance)
    {
        DataTypes.Supplier memory supplier = suppliersByAddress[_supplier];

        uint256 yieldSupplier = totalYieldEarnedSupplier(
            _supplier,
            IPoolStrategyV1(poolStrategy).balanceOf()
        );

        int96 netFlow = supplier.inStream - supplier.outStream.flow;

        if (netFlow >= 0) {
            realtimeBalance =
                yieldSupplier +
                (supplier.deposit) +
                uint96(netFlow) *
                (block.timestamp - supplier.timestamp) *
                PRECISSION;
        } else {
            realtimeBalance =
                yieldSupplier +
                (supplier.deposit) -
                uint96(supplier.outStream.flow) *
                (block.timestamp - supplier.timestamp) *
                PRECISSION;
        }
    }

    function _transfer(
        address from,
        address to,
        uint256 amount
    ) internal {
        require(from != address(0), "ERC20: transfer from the zero address");
        require(to != address(0), "ERC20: transfer to the zero address");

        _beforeTokenTransfer(from, to, amount);

        require(balanceOf(from) >= amount, "NOT_ENOUGH_BALANCE");

        callInternal(
            abi.encodeWithSignature(
                "transferSTokens(address,address,uint256)",
                from,
                to,
                amount
            )
        );

        emit Transfer(from, to, amount);

        _afterTokenTransfer(from, to, amount);

        bytes memory payload = abi.encode(from, amount);

        emitEvents(from);
        emit Events.SupplierEvent(
            DataTypes.SupplierEvent.TRANSFER,
            payload,
            block.timestamp,
            from
        );

        DataTypes.Supplier memory toSupplier = suppliersByAddress[to];
        emit Events.SupplierUpdate(toSupplier);
    }

    function totalSupply()
        public
        view
        override(IPoolV1, IERC20)
        returns (uint256 _totalSupply)
    {
        DataTypes.Pool memory lastPool = poolByTimestamp[lastPoolTimestamp];
        uint256 periodSpan = block.timestamp - lastPool.timestamp;
        _totalSupply =
            lastPool.deposit +
            uint96(lastPool.inFlowRate) *
            periodSpan -
            uint96(lastPool.outFlowRate) *
            periodSpan;
    }

    /**
     * @dev Returns the name of the token.
     */
    function name() public view returns (string memory) {
        return _name;
    }

    /**
     * @dev Returns the symbol of the token, usually a shorter version of the
     * name.
     */
    function symbol() public view returns (string memory) {
        return _symbol;
    }

    /**
     * @dev Returns the number of decimals used to get its user representation.
     * For example, if `decimals` equals `2`, a balance of `505` tokens should
     * be displayed to a user as `5.05` (`505 / 10 ** 2`).
     *
     * Tokens usually opt for a value of 18, imitating the relationship between
     * Ether and Wei. This is the value {ERC20} uses, unless this function is
     * overridden;
     *
     * NOTE: This information is only used for _display_ purposes: it in
     * no way affects any of the arithmetic of the contract, including
     * {IERC20-balanceOf} and {IERC20-transfer}.
     */
    function decimals() public pure returns (uint8) {
        return 18;
    }

    /**
     * @dev See {IERC20-transfer}.
     *
     * Requirements:
     *
     * - `to` cannot be the zero address.
     * - the caller must have a balance of at least `amount`.
     */
    function transfer(address to, uint256 amount)
        public
        override
        returns (bool)
    {
        address owner = _msgSender();
        _transfer(owner, to, amount);
        return true;
    }

    /**
     * @dev See {IERC20-allowance}.
     */
    function allowance(address owner, address spender)
        public
        view
        override
        returns (uint256)
    {
        return _allowances[owner][spender];
    }

    /**
     * @dev See {IERC20-approve}.
     *
     * NOTE: If `amount` is the maximum `uint256`, the allowance is not updated on
     * `transferFrom`. This is semantically equivalent to an infinite approval.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function approve(address spender, uint256 amount)
        public
        override
        returns (bool)
    {
        address owner = _msgSender();
        _approve(owner, spender, amount);
        return true;
    }

    /**
     * @dev See {IERC20-transferFrom}.
     *
     * Emits an {Approval} event indicating the updated allowance. This is not
     * required by the EIP. See the note at the beginning of {ERC20}.
     *
     * NOTE: Does not update the allowance if the current allowance
     * is the maximum `uint256`.
     *
     * Requirements:
     *
     * - `from` and `to` cannot be the zero address.
     * - `from` must have a balance of at least `amount`.
     * - the caller must have allowance for ``from``'s tokens of at least
     * `amount`.
     */
    function transferFrom(
        address from,
        address to,
        uint256 amount
    ) public override returns (bool) {
        address spender = _msgSender();
        _spendAllowance(from, spender, amount);
        _transfer(from, to, amount);
        return true;
    }

    /**
     * @dev Atomically increases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     */
    function increaseAllowance(address spender, uint256 addedValue)
        public
        returns (bool)
    {
        address owner = _msgSender();
        _approve(owner, spender, allowance(owner, spender) + addedValue);
        return true;
    }

    /**
     * @dev Atomically decreases the allowance granted to `spender` by the caller.
     *
     * This is an alternative to {approve} that can be used as a mitigation for
     * problems described in {IERC20-approve}.
     *
     * Emits an {Approval} event indicating the updated allowance.
     *
     * Requirements:
     *
     * - `spender` cannot be the zero address.
     * - `spender` must have allowance for the caller of at least
     * `subtractedValue`.
     */
    function decreaseAllowance(address spender, uint256 subtractedValue)
        public
        returns (bool)
    {
        address owner = _msgSender();
        uint256 currentAllowance = allowance(owner, spender);
        require(
            currentAllowance >= subtractedValue,
            "ERC20: decreased allowance below zero"
        );
        unchecked {
            _approve(owner, spender, currentAllowance - subtractedValue);
        }

        return true;
    }

    /**
     * @dev Creates `amount` tokens and assigns them to `account`, increasing
     * the total supply.
     *
     * Emits a {Transfer} event with `from` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     */
    function _mint(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: mint to the zero address");

        _beforeTokenTransfer(address(0), account, amount);

        _totalSupply += amount;
        unchecked {
            // Overflow not possible: balance + amount is at most totalSupply + amount, which is checked above.
            _balances[account] += amount;
        }
        emit Transfer(address(0), account, amount);

        _afterTokenTransfer(address(0), account, amount);
    }

    /**
     * @dev Destroys `amount` tokens from `account`, reducing the
     * total supply.
     *
     * Emits a {Transfer} event with `to` set to the zero address.
     *
     * Requirements:
     *
     * - `account` cannot be the zero address.
     * - `account` must have at least `amount` tokens.
     */
    function _burn(address account, uint256 amount) internal {
        require(account != address(0), "ERC20: burn from the zero address");

        _beforeTokenTransfer(account, address(0), amount);

        uint256 accountBalance = _balances[account];
        require(accountBalance >= amount, "ERC20: burn amount exceeds balance");
        unchecked {
            _balances[account] = accountBalance - amount;
            // Overflow not possible: amount <= accountBalance <= totalSupply.
            _totalSupply -= amount;
        }

        emit Transfer(account, address(0), amount);

        _afterTokenTransfer(account, address(0), amount);
    }

    /**
     * @dev Sets `amount` as the allowance of `spender` over the `owner` s tokens.
     *
     * This internal function is equivalent to `approve`, and can be used to
     * e.g. set automatic allowances for certain subsystems, etc.
     *
     * Emits an {Approval} event.
     *
     * Requirements:
     *
     * - `owner` cannot be the zero address.
     * - `spender` cannot be the zero address.
     */
    function _approve(
        address owner,
        address spender,
        uint256 amount
    ) internal {
        require(owner != address(0), "ERC20: approve from the zero address");
        require(spender != address(0), "ERC20: approve to the zero address");

        _allowances[owner][spender] = amount;
        emit Approval(owner, spender, amount);
    }

    /**
     * @dev Updates `owner` s allowance for `spender` based on spent `amount`.
     *
     * Does not update the allowance amount in case of infinite allowance.
     * Revert if not enough allowance is available.
     *
     * Might emit an {Approval} event.
     */
    function _spendAllowance(
        address owner,
        address spender,
        uint256 amount
    ) internal {
        uint256 currentAllowance = allowance(owner, spender);
        if (currentAllowance != type(uint256).max) {
            require(
                currentAllowance >= amount,
                "ERC20: insufficient allowance"
            );
            unchecked {
                _approve(owner, spender, currentAllowance - amount);
            }
        }
    }

    /**
     * @dev Hook that is called before any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * will be transferred to `to`.
     * - when `from` is zero, `amount` tokens will be minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens will be burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _beforeTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal {}

    /**
     * @dev Hook that is called after any transfer of tokens. This includes
     * minting and burning.
     *
     * Calling conditions:
     *
     * - when `from` and `to` are both non-zero, `amount` of ``from``'s tokens
     * has been transferred to `to`.
     * - when `from` is zero, `amount` tokens have been minted for `to`.
     * - when `to` is zero, `amount` of ``from``'s tokens have been burned.
     * - `from` and `to` are never both zero.
     *
     * To learn more about hooks, head to xref:ROOT:extending-contracts.adoc#using-hooks[Using Hooks].
     */
    function _afterTokenTransfer(
        address from,
        address to,
        uint256 amount
    ) internal {}

    function _msgSender() internal view virtual returns (address) {
        return msg.sender;
    }

    function _msgData() internal view virtual returns (bytes calldata) {
        return msg.data;
    }

    // #endregion ============ ===============  ERC20 implementation ============= ============= //

    // #region =========== ================ EMERGENCY =========== ================ //

    function setEmergency(bool _emergency) external onlyOwner () {
        emergency = _emergency;
    }
    
    
    function emergencyCloseStream(
        address[] memory sender,
        address[] memory receiver
    ) external onlyOwner {
        if (emergency) {
            for (uint256 i = 0; i < sender.length; i++) {
                _cfaLib.deleteFlow(sender[i], receiver[i], superToken);
                if (sender[i] == address(this)) {
                    bytes32 taskId = suppliersByAddress[receiver[i]]
                        .outStream
                        .cancelWithdrawId;
                    ops.cancelTask(taskId);
                    suppliersByAddress[receiver[i]].outStream = DataTypes
                        .OutStream(0, 0, 0, 0);
                } else {
                    suppliersByAddress[sender[i]].inStream = 0;
                }
            }
        }
    }

    function emergencyUpdateBalanceSuppplier(
        address[] memory suppliers,
        uint256[] memory balances
    ) external onlyOwner {
        if (emergency) {
            for (uint256 i = 0; i < suppliers.length; i++) {
                DataTypes.Supplier storage supplier = suppliersByAddress[
                    suppliers[i]
                ];
                supplier.deposit = balances[i];
                supplier.timestamp = block.timestamp;
            }
        }
    }

    // #endregion =========== ================ EMERGENCY =========== ================ //

    function readStorageSlot(uint8 i) public view returns (bytes32 result) {
        assembly {
            result := sload(i)
        }
    }
}
