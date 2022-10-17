//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

import {ERC20Upgradeable} from "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";


import {DataTypes} from "./libraries/DataTypes.sol";
import {Events} from "./libraries/Events.sol";


import {IPoolFactoryV2} from "./interfaces/IPoolFactory-V2.sol";
import {IResolverSettingsV2} from "./interfaces/IResolverSettings-V2.sol";
import {IPoolInternalV2} from "./interfaces/IPoolInternal-V2.sol";
import {IPoolStrategyV2} from "./interfaces/IPoolStrategy-V2.sol";

contract STokenFactoryV2  is ERC20Upgradeable {
      using SafeMath for uint256;

  IPoolFactoryV2 pool;
  IPoolInternalV2 poolInternal;
  IPoolStrategyV2 poolStrategy;

  uint256 public  PRECISSION;

  constructor() {}


  /**
   * @notice initializer of the Pool
   */
  function initialize(IResolverSettingsV2 resolverSettings,string memory _name, string memory _symbol) external initializer {
    ///initialState
    __ERC20_init(_name,_symbol);
    pool = IPoolFactoryV2(resolverSettings.getPool());
    poolStrategy = IPoolStrategyV2(resolverSettings.getPoolStrategy());
    poolInternal = IPoolInternalV2(resolverSettings.getPoolInternal());
    PRECISSION = resolverSettings.getPrecission();
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


    DataTypes.Supplier memory supplier = pool.getSupplierByAdress(_supplier);


    uint256 yieldSupplier = poolInternal.totalYieldEarnedSupplier(_supplier, poolStrategy.balanceOf());

    console.log(69,yieldSupplier);
    console.log(70, uint96(supplier.outStream.flow));
    console.log(71,supplier.outStream.initTime );
    console.log(72, block.timestamp);
     console.log(73, supplier.deposit);
     console.log(74,  supplier.outStream.minBalance.mul(PRECISSION));
    console.log(75, supplier.deposit + supplier.outStream.minBalance.mul(PRECISSION));
    int96 netFlow = supplier.inStream.flow - supplier.outStream.flow;

    if (netFlow >= 0) {
      realtimeBalance = yieldSupplier + (supplier.deposit) + uint96(netFlow) * (block.timestamp - supplier.timestamp) * PRECISSION;
    } else {
      console.log(uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime));
       console.log(uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime)*PRECISSION);
      realtimeBalance = yieldSupplier + supplier.outStream.minBalance.mul(PRECISSION) +  (supplier.deposit) - uint96(supplier.outStream.flow) * (block.timestamp - supplier.outStream.initTime) * PRECISSION;
    }
    //+ supplier.outStream.stepAmount.mul(PRECISSION) 
    console.log(83,realtimeBalance);
      
}



  function _transfer(
    address from,
    address to,
    uint256 amount
  ) internal virtual override {
    require(from != address(0), "ERC20: transfer from the zero address");
    require(to != address(0), "ERC20: transfer to the zero address");
  console.log(922222);


    _beforeTokenTransfer(from, to, amount);

    uint256 fromBalance = balanceOf(from);
    require(fromBalance >= amount, "ERC20: transfer amount exceeds balance");

    pool.poolUpdateCurrentState();


    pool.updateSupplierDeposit(from, 0, amount);
    console.log('DELETE DEPOSIT');
    pool.updateSupplierDeposit(to, amount, 0);
 console.log('UPDATE DEPOSIT');
    emit Transfer(from, to, amount);

    _afterTokenTransfer(from, to, amount);
  }

  function totalSupply() public view override returns (uint256) {
    DataTypes.PoolV2 memory lastPool = pool.getLastPool();
    uint256 periodSpan = block.timestamp - lastPool.timestamp;
    uint256 _totalSupply = lastPool.deposit + uint96(lastPool.inFlowRate) * periodSpan - uint96(lastPool.outFlowRate) * periodSpan;

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
