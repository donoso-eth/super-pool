//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

import "@openzeppelin/contracts/token/ERC777/ERC777.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777.sol";
import "@openzeppelin/contracts/utils/introspection/IERC1820Registry.sol";
import "@openzeppelin/contracts/token/ERC777/IERC777Recipient.sol";

import {ISuperfluid, ISuperAgreement, ISuperToken, ISuperApp, SuperAppDefinitions} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/superfluid/ISuperfluid.sol";
import {IConstantFlowAgreementV1} from "@superfluid-finance/ethereum-contracts/contracts/interfaces/agreements/IConstantFlowAgreementV1.sol";
import {SuperAppBase} from "@superfluid-finance/ethereum-contracts/contracts/apps/SuperAppBase.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

contract SuperPool is SuperAppBase, IERC777Recipient {
  using SafeMath for uint256;
  using Counters for Counters.Counter;

  ISuperfluid public host; // host
  IConstantFlowAgreementV1 public cfa; // the stored constant flow agreement class address
  ISuperToken superToken;

  uint256[] activeSuppliers;
 

  mapping(address => DataTypes.Supplier) usersByAddress;

  mapping(uint256 => address) userAdressById;

  mapping (uint256 => DataTypes.Period) periodById;

  Counters.Counter public periodId;
  Counters.Counter public supplierId;

  constructor(ISuperfluid _host, ISuperToken _superToken) {
    host = _host;
    superToken = _superToken;
    cfa = IConstantFlowAgreementV1(
      address(
        host.getAgreementClass(
          keccak256(
            "org.superfluid-finance.agreements.ConstantFlowAgreement.v1"
          )
        )
      )
    );

    uint256 configWord = SuperAppDefinitions.APP_LEVEL_FINAL |
      SuperAppDefinitions.BEFORE_AGREEMENT_CREATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_UPDATED_NOOP |
      SuperAppDefinitions.BEFORE_AGREEMENT_TERMINATED_NOOP;

    host.registerApp(configWord);

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
    require(msg.sender == address(host), "RedirectAll: support only one host");
    _;
  }

  modifier onlyExpected(address agreementClass) {
    require(_isCFAv1(agreementClass), "RedirectAll: only CFAv1 supported");
    _;
  }

  // endregion

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

    console.log(from);
    console.log(msg.sender);
    console.log(amount);

    _deposit(from, amount);
  }

  function _calculateReward(DataTypes.Supplier memory supplier) internal {}

  function _addPeriod(DataTypes.Supplier memory supplier) internal {}

  function _deposit(address from, uint256 amount) internal {
    require(amount > 0, "AMOUNT_TO_BE_POSITIVE");



    DataTypes.Supplier storage supplier = usersByAddress[from];

    uint256 currentAmount = supplier.deposit.stakedAmount;
    int96 currentFlow = supplier.stream.flow;

    //// calcualte previous rewards if already staked;
    if (currentAmount > 0 || currentFlow > 0) {
      _calculateReward(supplier);
    }

    supplier.deposit = DataTypes.Deposit(currentAmount + amount, block.timestamp);

    // emit Events.RewardDistributed( pcrId, amount);
  }

  function _stream(address from, int96 flow) internal {
    DataTypes.Supplier storage supplier = usersByAddress[from];

    uint256 currentAmount = supplier.deposit.stakedAmount;
    int96 currentFlow = supplier.stream.flow;
    //// calcualte previous rewards if already staked;
    if (currentAmount > 0 || currentFlow > 0) {
      _calculateReward(supplier);
    }

    supplier.stream = DataTypes.Stream(currentFlow + flow, block.timestamp);
  }

  function withDraw(uint256 amount) public {}

  /**************************************************************************
   * SuperApp callbacks
   *************************************************************************/


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
    onlyExpected(_agreementClass)
    onlyHost
    returns (bytes memory newCtx)
  {
    newCtx = _ctx;

    require(ISuperToken(superToken) == _superToken, "SUPERTOKEN_NOT_MATCH");

    (address sender, address receiver) = abi.decode(
      _agreementData,
      (address, address)
    );



    (, int96 inFlowRate, , ) = cfa.getFlow(
      superToken,
      sender,
      address(this)
    );

        _stream(sender,inFlowRate);

    // emit Events.LoanTradeCreated();

    //registerGelato and set call back find stream

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
    try this.parseLoanData(host.decodeCtx(_ctx).userData) returns (
      uint256 loanOfferId,
      address loanTaker
    ) {
      console.log("juppy juppy ok");
    } catch (
      bytes memory /*lowLevelData*/
    ) {
      // This is executed in case revert() was used.
      console.log("juppy juppy error");
    }

    (address sender, ) = abi.decode(_agreementData, (address, address));

    return _ctx;
  }

  function parseLoanData(bytes memory data)
    public
    pure
    returns (uint256 loanOfferId, address loanTaker)
  {
    (loanOfferId, loanTaker) = abi.decode(data, (uint256, address));
  }

  /**************************************************************************
   * INTERNAL HELPERS
   *************************************************************************/

  function _isCFAv1(address agreementClass) private view returns (bool) {
    return
      ISuperAgreement(agreementClass).agreementType() ==
      keccak256("org.superfluid-finance.agreements.ConstantFlowAgreement.v1");
  }
}
