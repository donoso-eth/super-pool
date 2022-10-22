//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "@openzeppelin/contracts/proxy/utils/UUPSUpgradeable.sol";
//import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";

import {IPoolV1} from "./interfaces/IPool-V1.sol";
import {IPoolInternalV1} from "./interfaces/IPoolInternal-V1.sol";
import {IPoolStrategyV1} from "./interfaces/IPoolStrategy-V1.sol";

import { UUPSProxiable } from "./upgradability/UUPSProxiable.sol";

contract STokenV1 is UUPSProxiable , ERC20Upgradeable {
  using SafeMath for uint256;
  address superHost;
  address owner;
  IPoolV1 pool;
  IPoolInternalV1 poolInternal;
  IPoolStrategyV1 poolStrategy;
  uint256 public PRECISSION;

  constructor() {}

  /**
   * @notice initializer of the Pool
   */
  function initialize( DataTypes.STokenInitializer memory tokenInit) external  initializer {
    ///initialState
    __ERC20_init(tokenInit.name, tokenInit.symbol);

    superHost = msg.sender;
    owner = tokenInit.owner;

    poolStrategy = tokenInit.poolStrategy;
    poolInternal = tokenInit.poolInternal;
    pool = tokenInit.pool;

    PRECISSION = pool.getPrecission();
  }

      function proxiableUUID()
        public pure override
        returns (bytes32)
    {
        return keccak256("org.super-pool.pool.v2");
    }

    function updateCode(address newAddress)
        external override
    {
        require(msg.sender == owner, "only owner can update code");
        return _updateCodeAddress(newAddress);
    }

  // #region  ============= =============  ERC20  ============= ============= //
  /****************************************************************************************************
   * @notice ERC20 overrides
   *
   * ---- balanceOf
   * ---- _transfer
   * ---- totalSupply()
   *
   ****************************************************************************************************/

  function balanceOf(address _supplier) public view override returns (uint256 balance) {
    balance = getSupplierBalance(_supplier).div(PRECISSION);
  }

  function getSupplierBalance(address _supplier) public view returns (uint256 realtimeBalance) {
    DataTypes.Supplier memory supplier = poolInternal.getSupplier(_supplier);

    uint256 yieldSupplier = poolInternal.totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());


    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      realtimeBalance = yieldSupplier + (supplier.deposit) + uint96(netFlow) * (block.timestamp - supplier.timestamp) * PRECISSION;
    } else {
      realtimeBalance = yieldSupplier + supplier.outStream.minBalance.mul(PRECISSION) + (supplier.deposit) - uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime) * PRECISSION;
    }

  }

  function _transfer(
    address from,
    address to,
    uint256 amount
  ) internal virtual override {
    require(from != address(0), "ERC20: transfer from the zero address");
    require(to != address(0), "ERC20: transfer to the zero address");


    _beforeTokenTransfer(from, to, amount);

    uint256 fromBalance = balanceOf(from);
    require(fromBalance >= amount, "NOT_ENOUGH_BALANCE");

    DataTypes.Supplier memory supplier = poolInternal.getSupplier(from);

    uint256 max_allowed = fromBalance.sub(supplier.outStream.minBalance);

    require(amount <= max_allowed, "NOT_ENOUGH_BALANCE:WITH_OUTFLOW");

    poolInternal.transferSTokens(from, to, amount);

    emit Transfer(from, to, amount);

    _afterTokenTransfer(from, to, amount);
  }

  function totalSupply() public view override returns (uint256) {
    DataTypes.PoolV1 memory lastPool = poolInternal.getLastPool();
    uint256 periodSpan = block.timestamp - lastPool.timestamp;
    uint256 _totalSupply = lastPool.deposit + uint96(lastPool.inFlowRate) * periodSpan - uint96(lastPool.outFlowRate) * periodSpan;

    return _totalSupply;
  }

  // endregion overriding ERC20

  modifier onlySuperHost() {
    require(msg.sender == superHost, "Only Host");
    _;
  }

  modifier onlyOwner() {
    require(msg.sender == owner, "Only Owner");
    _;
  }

  // #region  ============= =============  ERC4626 Interface  ============= ============= //
  /****************************************************************************************************
   * @notice ERC20 & ERC4626 & interface skstructure (tbd if is needed)
   *
   * ---- NOT YET READY
   *
   *
   *
   ****************************************************************************************************/

  // function deposit(uint256 assets, address receiver) external override returns (uint256 shares) {
  //   ERC20(address(superToken)).transferFrom(msg.sender, address(this), assets);
  //   _deposit(msg.sender, receiver, assets);
  //   shares = assets;
  // }

  // function asset() external view override returns (address assetTokenAddress) {
  //   assetTokenAddress = address(this);
  // }

  // function totalAssets() external view override returns (uint256 totalManagedAssets) {
  //   totalManagedAssets = ISuperToken(superToken).balanceOf(address(this));
  // }

  // function convertToShares(uint256 assets) external pure override returns (uint256 shares) {
  //   shares = assets;
  // }

  // function convertToAssets(uint256 shares) external pure override returns (uint256 assets) {
  //   assets = shares;
  // }

  // function maxDeposit(address receiver) external pure override returns (uint256 maxAssets) {
  //   maxAssets = type(uint256).max;
  // }

  // #endregion ERC4626 Interface
}
