// SPDX-License-Identifier: AGPLv3
pragma solidity ^0.8.0;

import {SuperTokenBase} from "./SuperToken/SuperTokenBase.sol";

/// @title Super Token for SuperPool
/// @author donoso.eth
/// @notice
contract PoolTokenFactory is SuperTokenBase {
  address public pool;

  constructor() {}

  /// @notice Initializer, used AFTER factory upgrade
  /// @dev We MUST mint here, there is no other way to mint tokens
  /// @param name Name of Super Token
  /// @param symbol Symbol of Super Token
  /// @param factory Super Token factory for initialization
  /// @param _pool pool Adress
  function initialize(
    string memory name,
    string memory symbol,
    address factory,
    address _pool
  ) external {
    _initialize(name, symbol, factory);
	pool = _pool;
  }

  // ============= =============  Modifiers ============= ============= //
  // #region Modidiers

  modifier onlyPool() {
    require(msg.sender == address(pool), "NOT-POOL-CONTRACT");
    _;
  }

  // endregion

  /// @notice Mints tokens, only the owner may do this
  /// @param receiver Receiver of minted tokens
  /// @param amount Amount to mint
  function mint(
    address receiver,
    uint256 amount,
    bytes memory userData
  ) external onlyPool {
    _mint(receiver, amount, userData);
  }

  /// @notice Burns from message sender
  /// @param amount Amount to burn
  function burn(uint256 amount, bytes memory userData) external onlyPool {
    _burn(msg.sender, amount, userData);
  }
}
