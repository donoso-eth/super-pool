//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

contract PoolFactory is SuperAppBase, IERC777Recipient, Initializable {
    using SafeMath for uint256;
    using Counters for Counters.Counter;

    ISuperfluid public host; // host
    IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address
    ISuperToken superToken;

    uint256[] activeSuppliers;

    mapping(address => DataTypes.Supplier) public suppliersByAddress;

    mapping(uint256 => address) supplierAdressById;

    mapping(uint256 => DataTypes.Period) public periodById;

    Counters.Counter public periodId;
    Counters.Counter public supplierId;

    address public ops;
    address payable public gelato;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    constructor() {}

    /**
     * @notice initializer of the contract/oracle
     */
    function initialize(
        DataTypes.PoolFactoryInitializer calldata poolFactoryInitializer
    ) external initializer {
        //// super app
        host = poolFactoryInitializer.host;
        superToken = poolFactoryInitializer.superToken;
        cfa = IConstantFlowAgreementV1(
            address(
                host.getAgreementClass(
                    keccak256(
                        "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
                    )
                )
            )
        );

        //// gelato
        ops = poolFactoryInitializer.ops;
        gelato = IOps(poolFactoryInitializer.ops).gelato();

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
    }

    // ============= =============  Modifiers ============= ============= //
    // #region Modidiers

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

    // endregion

    function getPeriod(uint256 _periodId)
        public
        view
        returns (DataTypes.Period memory)
    {
        return periodById[_periodId];
    }

    function mockYield(uint256 _yield) public {
        _addYield(_yield);
    }

    function calculateYieldSupplier(address _supplier) public {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];
        require(supplier.createdTimestamp > 0, "SUPPLIER_NOT_AVAILABLE");
        uint256 periodFrom = supplier.periodId;
        uint256 periodTo = periodId.current();

        for (uint256 i = periodFrom; i < periodTo; i++) {
            DataTypes.Period memory _period = periodById[i];

            if (_period.yield > 0) {
                int96 netFlow = supplier.inStream.flow -
                    supplier.outStream.flow;

                int256 areaFlow = ((netFlow) * int256(_period.periodSpan**2)) /
                    2;

                int256 areaDeposit = ((
                    int256(_period.timestamp - supplier.createdTimestamp)
                ) *
                    netFlow +
                    int256(supplier.deposit.amount)) *
                    int256(_period.periodSpan);

                int256 totalAreaPeriod = areaDeposit + areaFlow;

                console.log(_period.periodTWAP);
                console.log(uint256(totalAreaPeriod));
            }
        }
    }

    // ============= =============  Gelato functions ============= ============= //
    // #region Gelato functions

    modifier onlyOps() {
        require(msg.sender == ops, "OpsReady: onlyOps");
        _;
    }

    function startTask(uint256 _amount) external payable {
        require(msg.value == 0.1 ether, "NOT-BALANCE");
        // (bool success, ) = address(0x527a819db1eb0e34426297b03bae11F2f8B3A19E).call{value: 0.1 ether}("");
    }

    function cancelTask(bytes32 _taskId) public {
        IOps(ops).cancelTask(_taskId);
    }

    function stopstream(address receiver) external onlyOps {
        //// check if
        (, int96 inFlowRate, , ) = cfa.getFlow(
            superToken,
            address(this),
            receiver
        );

        //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
        uint256 fee;
        address feeToken;

        (fee, feeToken) = IOps(ops).getFeeDetails();

        _transfer(fee, feeToken);

        if (inFlowRate > 0) {
            host.callAgreement(
                cfa,
                abi.encodeWithSelector(
                    cfa.deleteFlow.selector,
                    superToken,
                    address(this),
                    receiver,
                    new bytes(0) // placeholder
                ),
                "0x"
            );

            //// TO DO transfer last yield won
        }

        bytes32 taskId = suppliersByAddress[receiver].outStream.cancelTaskId;
        if (taskId != bytes32(0)) {
            cancelTask(taskId);
            suppliersByAddress[receiver].outStream.cancelTaskId = bytes32(0);
        }
    }

    function checker(address receiver)
        external
        returns (bool canExec, bytes memory execPayload)
    {
        canExec = true;

        execPayload = abi.encodeWithSelector(
            this.stopstream.selector,
            address(receiver)
        );
    }

    function withdraw() external returns (bool) {
        (bool result, ) = payable(msg.sender).call{
            value: address(this).balance
        }("");
        return result;
    }

    receive() external payable {}

    function _transfer(uint256 _amount, address _paymentToken) internal {
        if (_paymentToken == ETH) {
            (bool success, ) = gelato.call{value: _amount}("");
            require(success, "_transfer: ETH transfer failed");
        } else {
            SafeERC20.safeTransfer(IERC20(_paymentToken), gelato, _amount);
        }
    }

    // #endregion Gelato functions

    // ============= =============  Internal Functions ============= ============= //
    // #region InternalFunctions

    function _getSupplier(address _supplier)
        internal
        returns (DataTypes.Supplier storage)
    {
        DataTypes.Supplier storage supplier = suppliersByAddress[_supplier];

        if (supplier.createdTimestamp == 0) {
            supplier.createdTimestamp = block.timestamp;
            supplier.supplier = _supplier;

            supplierId.increment();
            supplier.supplierId = supplierId.current();

            supplierAdressById[supplier.supplierId] = _supplier;

            activeSuppliers.push(supplier.supplierId);
        }

        // periodId.increment();
        // supplier.periodId = periodId.current();

        return supplier;
    }

    // #endregion

    // ============= =============  User Interaction PoolEvents ============= ============= //
    // #region User Interaction PoolEvents

    //// deposit (erc777 tokensReceive callback or afterCreatedstream  and afterTerminatedCallback  superapp callback)

    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external override {
        // do stuff
        require(msg.sender == address(superToken), "INVALID_TOKEN");
        require(amount > 0, "AMOUNT_TO_BE_POSITIVE");

        DataTypes.Supplier storage supplier = _getSupplier(from);

        uint256 currentAmount = supplier.deposit.amount;

        _poolUpdate();

        supplier.deposit = DataTypes.Deposit(
            currentAmount + amount,
            block.timestamp
        );

        uint256 _periodId = periodId.current();

        periodById[_periodId].deposit = periodById[_periodId].deposit + amount;

        emit Events.SupplyDepositStarted(from, amount);
    }

    function afterCreatedCallback(
        address from,
        int96 inFlow,
        int96 outFlow
    ) internal {
        DataTypes.Supplier storage supplier = _getSupplier(from);

        _poolUpdate();

        if (inFlow != 0) {
            int96 currentFlow = supplier.inStream.flow;

            supplier.inStream = DataTypes.Stream(
                currentFlow + inFlow,
                block.timestamp,
                bytes32(0)
            );
            uint256 _periodId = periodId.current();

            periodById[_periodId].flow = periodById[_periodId].flow + inFlow;

            emit Events.SupplyStreamStarted(from, inFlow);
        }
    }

    function afterTerminatedCallback(address sender) internal {
        _poolUpdate();

        DataTypes.Supplier storage supplier = suppliersByAddress[sender];

        uint256 _periodId = periodId.current();

        periodById[_periodId].flow =
            periodById[_periodId].flow -
            supplier.inStream.flow;

        supplier.inStream = DataTypes.Stream(0, block.timestamp, bytes32(0));
    }

    //// withdraw

    function withdrawDeposit(uint256 withdrawAmount) public {
        DataTypes.Supplier storage withdrawer = suppliersByAddress[msg.sender];

        int96 netFlow = withdrawer.inStream.flow - withdrawer.outStream.flow;

        int256 totalDeposit = ((
            int256(block.timestamp - withdrawer.createdTimestamp)
        ) * netFlow);

        uint256 realtimeBalance = withdrawer.deposit.amount;

        // uint256 flowSpan = block.timestamp - withdrawer.stream.initTimestamp;

        // if (withdrawer.stream.flow > 0) {
        //   realtimeBalance = ++flowSpan * uint96(withdrawer.stream.flow);
        // } else if (withdrawer.stream.flow < 0) {
        //   realtimeBalance = --flowSpan * uint96(withdrawer.stream.flow);
        // }

        require(realtimeBalance >= withdrawAmount, "NOT_ENOUGH_BALANCE");

        ///// TO DO
        /// REWARDS PAT TO BE ADDEDD
        ISuperToken(superToken).send(msg.sender, withdrawAmount, "0x");
    }

    function withdrawStream(uint256 stopDateInMs) public {
        //// update state supplier
        DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

        require(supplier.outStream.flow == 0, "OUT_STREAM_EXISTS");

        uint256 totalDeposit = supplier.deposit.amount +
            uint96(supplier.inStream.flow) *
            (block.timestamp - supplier.inStream.initTimestamp);

        require(totalDeposit > 0, "NO_BALANCE");

        //// TO DO calculate yeild
        uint256 totalYield = 3;

        int96 outFlowRate = int96(
            int256(totalDeposit + totalYield) /
                int256(stopDateInMs - block.timestamp)
        );

        //// Advance period

        //// start stream

        host.callAgreement(
            cfa,
            abi.encodeWithSelector(
                cfa.createFlow.selector,
                superToken,
                msg.sender,
                outFlowRate,
                new bytes(0) // placeholder
            ),
            "0x"
        );

        ////// set closing stream task
        bytes32 taskId = IOps(ops).createTimedTask(
            uint128(stopDateInMs),
            180,
            address(this),
            this.stopstream.selector,
            address(this),
            abi.encodeWithSelector(this.checker.selector, msg.sender),
            ETH,
            false
        );

        //// update state supplier
        supplier.outStream.cancelTaskId = taskId;
        supplier.outStream.initTimestamp = block.timestamp;
        supplier.outStream.flow = outFlowRate;
    }

    /// request by the user trough the contract /// TODO Handle terminated when
    function withdrawStopStream(uint256 stopDateInMs) public {
        //// update state supplier
        DataTypes.Supplier storage supplier = suppliersByAddress[msg.sender];

        require(supplier.inStream.flow > 0, "IN_STREAM_NOT_EXISTS");

        if (supplier.outStream.flow != 0){

        } else {

        uint256 totalDeposit = supplier.deposit.amount +
            uint96(supplier.inStream.flow) *
            (block.timestamp - supplier.inStream.initTimestamp);

        require(totalDeposit > 0, "NO_BALANCE");

        //// TO DO calculate yeild
        uint256 totalYield = 3;

        int96 outFlowRate = int96(
            int256(totalDeposit + totalYield) /
                int256(stopDateInMs - block.timestamp)
        );

        //// Advance period

        //// start stream

        host.callAgreement(
            cfa,
            abi.encodeWithSelector(
                cfa.createFlow.selector,
                superToken,
                msg.sender,
                outFlowRate,
                new bytes(0) // placeholder
            ),
            "0x"
        );

        ////// set closing stream task
        bytes32 taskId = IOps(ops).createTimedTask(
            uint128(stopDateInMs),
            180,
            address(this),
            this.stopstream.selector,
            address(this),
            abi.encodeWithSelector(this.checker.selector, msg.sender),
            ETH,
            false
        );

        //// update state supplier
        supplier.outStream.cancelTaskId = taskId;
        supplier.outStream.initTimestamp = block.timestamp;
        supplier.outStream.flow = outFlowRate;
        }
    }


    // #endregion User Interaction PoolEvents

    function _calculateYield(DataTypes.Supplier memory supplier) internal {}

    function _calculateYield() internal {}

    /**
     * @notice Add the yield to the Period
     * @dev  When yield are added to the pool, if there is active stream this
     *       function will call _poolUpdate() fucntion
     *       If there is not active stream, the proportion remains the same and the period remains unchanged
     */
    function _addYield(uint256 yieldAmount) internal {
        DataTypes.Period storage currentPeriod = periodById[periodId.current()];

        currentPeriod.yield = currentPeriod.yield + yieldAmount;
        if (currentPeriod.flow != 0) {
            ///// trigger re-schauffle
            _poolUpdate();
        }
    }

    /**
     * @notice Calculates the TWAP, the yieldshare by active user and push a new  Period
     * @dev This function will be called when liquidity is updated deposit/streamed/withdraw
     *      When yield are added to the pool, if there is active stream this lfunction will be calculated too.
     *      If there is not active stream, the proportion remains the same and the period remains unchanged
     */
    function _poolUpdate() internal {
        if (
            periodId.current() == 0 &&
            periodById[periodId.current()].timestamp == 0
        ) {
            periodById[periodId.current()].timestamp = block.timestamp;
        } else {
            periodId.increment();
            uint256 currentPeriodId = periodId.current();

            uint256 lastPeriodId = currentPeriodId - 1;

            DataTypes.Period storage currentPeriod = periodById[
                currentPeriodId
            ];
            currentPeriod.timestamp = block.timestamp;
            currentPeriod.periodId = currentPeriodId;

            DataTypes.Period storage lastPeriod = periodById[lastPeriodId];

            uint256 periodSpan = currentPeriod.timestamp - lastPeriod.timestamp;

            uint256 areaFlow = (uint96(lastPeriod.flow) * (periodSpan**2)) / 2;
            uint256 areaDeposit = lastPeriod.deposit * periodSpan;

            uint256 totalAreaPeriod = areaDeposit;

            if (lastPeriod.flow >= 0) {
                totalAreaPeriod = totalAreaPeriod + areaFlow;
            } else {
                totalAreaPeriod = totalAreaPeriod - areaFlow;
            }

            lastPeriod.periodTWAP = totalAreaPeriod;
            lastPeriod.periodSpan = periodSpan;
            currentPeriod.startTWAP =
                lastPeriod.startTWAP +
                lastPeriod.periodTWAP;

            currentPeriod.flow = lastPeriod.flow;
            currentPeriod.deposit =
                (uint96(lastPeriod.flow) * (periodSpan)) +
                lastPeriod.deposit;
        }
    }

    // ============= ============= Super App Calbacks ============= ============= //
    // #region Super App Calbacks
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
            afterCreatedCallback(sender, inFlowRate, 0);
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
    ) external virtual override returns (bytes memory newCtx) {
        (address sender, address receiver) = abi.decode(
            _agreementData,
            (address, address)
        );

        //// CHECK if IN-STREAM or OUT-STREAM
        if (sender == address(this)) {
            DataTypes.Supplier storage supplier = suppliersByAddress[sender];

            /// cancel Stream
            _poolUpdate();
        } else if (receiver == address(this)) {}

        return _ctx;
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
        onlyHost
        returns (bytes memory newCtx)
    {
        (address sender, address receiver) = abi.decode(
            _agreementData,
            (address, address)
        );

        if (sender == address(this)) {} else {
            (, int96 inFlowRate, , ) = cfa.getFlow(
                superToken,
                sender,
                address(this)
            );

            DataTypes.Supplier storage supplier = suppliersByAddress[sender];

            uint256 supplierId = supplier.supplierId;

            uint256 _periodId = periodId.current();

            //// current stream
            int96 currentStream = supplier.inStream.flow;

            periodById[_periodId].flow = --supplier.inStream.flow;

            supplier.inStream = DataTypes.Stream(
                0,
                block.timestamp,
                bytes32(0)
            );
        }
    }

    // #endregion Super App Calbacks

    /**************************************************************************
     * INTERNAL HELPERS
     *************************************************************************/

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
}
