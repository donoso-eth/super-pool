//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";
import {IERC4626} from "./interfaces/IERC4626.sol";

import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";


import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";



contract STokenFactoryV2  is ERC20Upgradeable {
      using SafeMath for uint256;
  address  ops;
  IPoolFactoryV2 pool;

  uint256 public constant PRECISSION = 1_000_000;

  constructor() {}


  /**
   * @notice initializer of the Pool
   */
  function initialize(IPoolFactoryV2 _pool, address _ops,string memory _name, string memory _symbol) external initializer {
    ///initialState
    __ERC20_init(_name,_symbol);

    ops = _ops;
    pool = _pool;
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
  function balanceOfShares(address _supplier) public view returns (uint256 _shares) {
    DataTypes.Supplier memory supplier = pool.getSupplierByAdress(_supplier);
    _shares = supplier.shares;

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      _shares = _shares + uint96(netFlow) * (block.timestamp - supplier.timestamp);
    } else {
      _shares = _shares - uint96(-netFlow) * (block.timestamp - supplier.timestamp);
    }
  }

function balanceOf(address _supplier) public view override returns (uint256 balance) {

     balance = getSupplierBalance(_supplier).div(PRECISSION);
  }

function getSupplierBalance(address _supplier) public view returns (uint256 realtimeBalance) {


    DataTypes.Supplier memory supplier = pool.getSupplierByAdress(_supplier);


    uint256 yieldSupplier = pool.totalYieldEarnedSupplier(_supplier);

    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      realtimeBalance = yieldSupplier + (supplier.deposit) + uint96(netFlow) * (block.timestamp - supplier.timestamp) * PRECISSION;
    } else {
      realtimeBalance = yieldSupplier + (supplier.deposit) - uint96(supplier.outAssets.flow) * (block.timestamp - supplier.timestamp) * PRECISSION;
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
    require(fromBalance >= amount, "ERC20: transfer amount exceeds balance");

    pool.poolUpdateCurrentState();

    uint256 myShares = balanceOf(from);

    uint256 total = getSupplierBalance(from);
    uint256 factor = total.div(myShares);
    uint256 outAssets = factor.mul(amount).div(PRECISSION);

    pool.updateSupplierDeposit(from, 0, amount, outAssets);

    pool.supplierUpdateCurrentState(to);

    pool.updateSupplierDeposit(to, amount, 0, 0);

    emit Transfer(from, to, amount);

    _afterTokenTransfer(from, to, amount);
  }

  function totalSupply() public view override returns (uint256) {
    DataTypes.PoolV2 memory lastPeriod = pool.getLastPool();
    uint256 periodSpan = block.timestamp - lastPeriod.timestamp;
    uint256 _totalSupply = lastPeriod.totalShares + uint96(lastPeriod.inFlowRate) * periodSpan - uint96(lastPeriod.outFlowRate) * periodSpan;

    return _totalSupply;
  }

  // endregion overriding ERC20

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
