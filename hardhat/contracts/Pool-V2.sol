//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

import {CFAv1Library} from "@superfluid-finance/ethereum-contracts/contracts/apps/CFAv1Library.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {OpsReady} from "./gelato/OpsReady.sol";
import {IOps} from "./gelato/IOps.sol";

import {ISTokenV2} from "./interfaces/ISToken-V2.sol";
import {IPoolInternalV2} from "./interfaces/IPoolInternal-V2.sol";
import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";
import {IGelatoTasksV2} from "./interfaces/IGelatoTasks-V2.sol";
import {IResolverSettingsV2} from "./interfaces/IResolverSettings-V2.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

/****************************************************************************************************
 * @title PoolFacory
 * @dev This contract provides the ability to deposit supertokens via single transactions or streaming.
 *      The state within the contract will be updated every time a "pool event"
 *      (yield accrued updated, start/stop stream/ deposit/withdraw, ertc..) happened. Every pool event
 *       a new pool state will be stored "period"
 *
 *      The update Process follows:
 *      1) Pool Events (external triggered)
 *      2) Pool Update, Pool state updated, index calculations from previous period
 *      3) Supplier Update State (User deòsitimg/withdrawing, etc.. )
 *      4) New created period Updated
 *
 ****************************************************************************************************/
contract PoolV2 is Initializable, UUPSUpgradeable, SuperAppBase, IERC777Recipient {
    // #region pool state

    using SafeMath for uint256;
    using Counters for Counters.Counter;

    address owner;
    address superHost;

    ISuperfluid public host; // host
    IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address
    ISuperToken superToken;

    using CFAv1Library for CFAv1Library.InitData;
    CFAv1Library.InitData internal _cfaLib;

    Counters.Counter public supplierId;

    IOps public ops;
    address payable public gelato;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    uint256 MAX_INT;

    uint256 PRECISSION;

    ISTokenV2 sToken;
    IPoolStrategyV2 poolStrategy;
    IGelatoTasksV2 gelatoTasks;
    IPoolInternalV2 poolInternal;
    IResolverSettingsV2 resolverSettings;

    IERC20 token;

    // #endregion pool state

    //// ERC4626 EVents
    constructor() {}

    /**
     * @notice initializer of the Pool
     */
    function initialize(
        ISuperfluid _host,
        ISuperToken _superToken,
        IERC20 _token,
        address _owner
    ) external initializer {
        ///initialState

        //// super app && superfluid
        host = _host;
        superToken = _superToken;

        cfa = IConstantFlowAgreementV1(address(host.getAgreementClass(keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1"))));
        token = _token;
        owner = _owner;
        superHost = msg.sender;

        MAX_INT = 2**256 - 1;

        _cfaLib = CFAv1Library.InitData(host, cfa);

        //// tokens receie implementation
        IERC1820Registry _erc1820 = IERC1820Registry(0x1820a4B7618BdE71Dce8cdc73aAB6C95905faD24);
        bytes32 TOKENS_RECIPIENT_INTERFACE_HASH = keccak256("ERC777TokensRecipient");

        _erc1820.setInterfaceImplementer(address(this), TOKENS_RECIPIENT_INTERFACE_HASH, address(this));

        ///// initializators
    }

    function initializeAfterSettings(IResolverSettingsV2 _resolverSettings) external onlySuperHost {
        resolverSettings = IResolverSettingsV2(_resolverSettings);
        sToken = ISTokenV2(resolverSettings.getSToken());

        poolStrategy = IPoolStrategyV2(resolverSettings.getPoolStrategy());
        gelatoTasks = IGelatoTasksV2(resolverSettings.getGelatoTasks());
        poolInternal = IPoolInternalV2(resolverSettings.getPoolInternal());

        ops = IOps(resolverSettings.getGelatoOps());

        gelato = ops.gelato();

        token.approve(address(poolStrategy), MAX_INT);
        superToken.approve(address(poolStrategy), MAX_INT);
    }

    function _authorizeUpgrade(address newImplementation) internal override onlyOwner {}

    // #region  ============= =============  Pool Events (supplier interaction) ============= ============= //
    /****************************************************************************************************
     * @notice Supplier (User) interaction
     * @dev Following interactions are expected:
     *
     * ---- tokensReceived()
     *      implementation callback tokensReceived(). Deposit funds via erc777.send() function.
     *
     * ---- RedeemDeposit()
     *
     * ---- _inStreamCallback()
     *      implementation of start stream through supwer app call back
     *
     * ---- inStreamStop()
     *
     * ---- redeemFlow()
     *
     * ---- redeemFlowStop()
     *
     ****************************************************************************************************/

    /**
     * @notice ERC277 call back allowing deposit tokens via .send()
     * @param from Supplier (user sending tokens / depositing)
     * @param amount amount received
     */
    function tokensReceived(
        address operator,
        address from,
        address to,
        uint256 amount,
        bytes calldata userData,
        bytes calldata operatorData
    ) external override {
        require(msg.sender == address(superToken), "INVALID_TOKEN");
        require(amount > 0, "AMOUNT_TO_BE_POSITIVE");

        

        poolInternal._tokensReceived(from, amount);

        DataTypes.Supplier memory supplier = poolInternal.getSupplier(from);
        bytes memory payload = abi.encode(amount);
        emit Events.SupplierUpdate(supplier);
        emit Events.SupplierEvent(DataTypes.SupplierEvent.DEPOSIT, payload, block.timestamp, from);
    }

    function redeemDeposit(uint256 redeemAmount) public {
        uint256 balance = sToken.balanceOf(msg.sender);

        address _supplier = msg.sender;

        require(balance > redeemAmount, "NOT_ENOUGH_BALANCE");

        poolInternal._redeemDeposit(redeemAmount, _supplier);

        DataTypes.Supplier memory supplier = poolInternal.getSupplier(_supplier);

        emit Events.SupplierUpdate(supplier);
        bytes memory payload = abi.encode(redeemAmount);
        emit Events.SupplierEvent(DataTypes.SupplierEvent.WITHDRAW, payload, block.timestamp, _supplier);
    }

    function redeemFlow(int96 _outFlowRate) external {
        //// update state supplier
        address _supplier = msg.sender;
        uint256 realTimeBalance = sToken.balanceOf(_supplier);

        require(realTimeBalance > 0, "NO_BALANCE");
        DataTypes.Supplier memory supplier = poolInternal.getSupplier(_supplier);

        DataTypes.SupplierEvent flowEvent = supplier.outStream.flow > 0 ? DataTypes.SupplierEvent.OUT_STREAM_UPDATE : DataTypes.SupplierEvent.OUT_STREAM_START;

        poolInternal._redeemFlow(_outFlowRate, _supplier);

        supplier = poolInternal.getSupplier(_supplier);
        emit Events.SupplierUpdate(supplier);
        bytes memory payload = abi.encode(_outFlowRate);
        emit Events.SupplierEvent(flowEvent, payload, block.timestamp, _supplier);
    }

    function redeemFlowStop() external {
      console.log('200 pool');
        poolInternal._redeemFlowStop(msg.sender);

        DataTypes.Supplier memory supplier = poolInternal.getSupplier(msg.sender);
       

        emit Events.SupplierUpdate(supplier);
        bytes memory payload = abi.encode("");
        emit Events.SupplierEvent(DataTypes.SupplierEvent.OUT_STREAM_STOP, payload, block.timestamp, msg.sender);
    }

    function transferSuperToken (address receiver,uint256 amount) external onlyInternal {
              IERC20(address(superToken)).transfer(receiver, amount);
    }


    function lastPoolTimestamp() external view returns(uint256){
      return poolInternal.getLastTimestmap();
    }

    function getPool(uint256 timestamp) external view returns(DataTypes.PoolV2 memory) {
      return poolInternal.getPool(timestamp);
    }
    
    function getLastPool() external view returns(DataTypes.PoolV2 memory)  {
      return poolInternal.getLastPool();
    }

    function closeAccount() external {}

    // #endregion User Interaction PoolEvents

    // #region  ============= =============  Public Supplier Functions ============= =============

    // #endregion

    // ============= =============  Modifiers ============= ============= //
    // #region Modidiers

    modifier onlyHost() {
        require(msg.sender == address(host), "RedirectAll: support only one host");
        _;
    }

    modifier onlyExpected(ISuperToken _superToken, address agreementClass) {
        require(_isSameToken(_superToken), "RedirectAll: not accepted token");
        require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
        _;
    }

    // endregion

    // ============= =============  Gelato functions ============= ============= //
    // #region Gelato functions

    /// called by Gelato
    // function stopstream(address _receiver, uint8 _flowType) external onlyOps {
    //   //// check if

    //   _poolUpdateCurrentState();
    //   _supplierUpdateCurrentState(_receiver);

    //   //// every task will be payed with a transfer, therefore receive(), we have to fund the contract
    //   uint256 fee;
    //   address feeToken;

    //   (fee, feeToken) = IOps(ops).getFeeDetails();

    //   _transfer(fee, feeToken);

    //   ///// OUtFLOW
    //   if (_flowType == 0) {
    //     (, int96 inFlowRate, , ) = cfa.getFlow(superToken, address(this), _receiver);

    //     if (inFlowRate > 0) {
    //       // _cfaLib.deleteFlow(address(this), _receiver, superToken);
    //       _updateSupplierFlow(_receiver, 0, 0, "0x");
    //       console.log("stopStream");
    //     }

    //     bytes32 taskId = suppliersByAddress[_receiver].outStream.cancelFlowId;
    //     if (taskId != bytes32(0)) {
    //       cancelTask(taskId);
    //       suppliersByAddress[_receiver].outStream.cancelFlowId = bytes32(0);
    //     }

    //     console.log("stopOUTStream");
    //   }
    //   ///// INFLOW FLOW
    //   else if (_flowType == 1) {
    //     console.log("stopINStream--1");
    //     (, int96 inFlowRate, , ) = cfa.getFlow(superToken, _receiver, address(this));

    //     if (inFlowRate > 0) {
    //       _cfaLib.deleteFlow(_receiver, address(this), superToken);
    //       _updateSupplierFlow(_receiver, 0, 0, "0x");
    //       console.log("stopINStream");
    //     }

    //     bytes32 taskId = suppliersByAddress[_receiver].inStream.cancelFlowId;
    //     if (taskId != bytes32(0)) {
    //       cancelTask(taskId);
    //       suppliersByAddress[_receiver].inStream.cancelFlowId = bytes32(0);
    //     }
    //   }
    // }

    /// called by Gelato

    function withdraw() external returns (bool) {
        (bool result, ) = payable(msg.sender).call{value: address(this).balance}("");
        return result;
    }

    receive() external payable {}

    function transfer(uint256 _amount, address _paymentToken) external onlyPoolStrategyOrInternal {
        _transfer(_amount, _paymentToken);
    }

    function _transfer(uint256 _amount, address _paymentToken) internal {
        if (_paymentToken == ETH) {
            (bool success, ) = gelato.call{value: _amount}("");
            require(success, "_transfer: ETH transfer failed");
        } else {
            SafeERC20.safeTransfer(IERC20(_paymentToken), gelato, _amount);
        }
    }

    // #endregion Gelato functions

    function sfCreateFlow(address receiver, int96 newOutFlow) external {
        _cfaLib.createFlow(receiver, superToken, newOutFlow);
    }

    function sfUpdateFlow(address receiver, int96 newOutFlow) external {
        _cfaLib.updateFlow(receiver, superToken, newOutFlow);
    }

    function sfDeleteFlow(address sender, address receiver) external {
        _cfaLib.deleteFlow(sender, receiver, superToken);
    }

    function sfDeleteFlowWithCtx(
        bytes calldata _ctx,
        address sender,
        address receiver
    ) external returns (bytes memory newCtx) {
        newCtx = _cfaLib.deleteFlowWithCtx(_ctx, sender, receiver, superToken);
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
    ) external override onlyExpected(_superToken, _agreementClass) onlyHost returns (bytes memory newCtx) {
        newCtx = _ctx;

        console.log(361, 'CRATE FLOW');

        (address sender, address receiver) = abi.decode(_agreementData, (address, address));

        (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));
        ISuperfluid.Context memory decodedContext = host.decodeCtx(_ctx);

        //// If In-Stream we will request a pool update

        if (receiver == address(this)) {
             newCtx = poolInternal.createFlow(newCtx, decodedContext, inFlowRate, sender);
            DataTypes.Supplier memory supplier = poolInternal.getSupplier(sender);
            // emit Events.SupplierUpdate(supplier);
            //  bytes memory payload = abi.encode(inFlowRate);
            //  emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_START, payload, block.timestamp, sender);

            // if (endSeconds > 0) {}
        } else {
            console.log("REDEEM FLOW");
        }

        return newCtx;
    }

    ///// NOT YET FINAL IMPLEMNTATION
    function afterAgreementTerminated(
        ISuperToken, /*superToken*/
        address, /*agreementClass*/
        bytes32, // _agreementId,
        bytes calldata _agreementData,
        bytes calldata, /*cbdata*/
        bytes calldata _ctx
    ) external virtual override returns (bytes memory newCtx) {
        (address sender, address receiver) = abi.decode(_agreementData, (address, address));
        newCtx = _ctx;

        //// If In-Stream we will request a pool update
        if (receiver == address(this)) {
            newCtx = poolInternal.terminateFlow(newCtx, sender);
            DataTypes.Supplier memory supplier = poolInternal.getSupplier(sender);
            emit Events.SupplierUpdate(supplier);
            bytes memory payload = abi.encode("");
            emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_STOP, payload, block.timestamp, sender);
        } else if (sender == address(this)) {
            console.log("OUT_STREAM_MANUAL_STOPPED");
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
    ) external override onlyExpected(_superToken, _agreementClass) onlyHost returns (bytes memory newCtx) {
        newCtx = _ctx;

        (address sender, address receiver) = abi.decode(_agreementData, (address, address));

        (, int96 inFlowRate, , ) = cfa.getFlow(superToken, sender, address(this));

        //// If In-Stream we will request a pool update
        if (receiver == address(this)) {
            newCtx = poolInternal.updateFlow(newCtx, inFlowRate, sender);

            DataTypes.Supplier memory supplier = poolInternal.getSupplier(sender);
            emit Events.SupplierUpdate(supplier);
            bytes memory payload = abi.encode("");
            emit Events.SupplierEvent(DataTypes.SupplierEvent.STREAM_UPDATE, payload, block.timestamp, sender);
        } else {}
        console.log("FLOW_UPDATED_FINISH");
        return newCtx;
    }

    // #endregion Super App Calbacks

    function _isCFAv1(address agreementClass) private view returns (bool) {
        return ISuperAgreement(agreementClass).agreementType() == keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
    }

    function _isSameToken(ISuperToken _superToken) private view returns (bool) {
        return address(_superToken) == address(superToken);
    }

        modifier onlyPoolStrategyOrInternal() {
        require(msg.sender == address(poolStrategy) || msg.sender == address(poolInternal)  , "Only Internal or Strategy");
        _;
    }

    modifier onlyPoolStrategy() {
        require(msg.sender == address(poolStrategy), "Only Strategy");
        _;
    }

   modifier onlyInternal() {
        require(msg.sender == address(poolInternal), "Only Internal");
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

    modifier onlySuperHost() {
        require(msg.sender == superHost, "Only Host");
        _;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "Only Owner");
        _;
    }
}
