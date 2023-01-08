// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

abstract contract ERC20Mintable {
  function mint(address receiver, uint256 amount) external virtual;

  function mint(uint256 amount) external virtual;

  function balanceOf(address receiver) external virtual returns (uint256);

  function approve(address approver, uint256 amount) external virtual;
}
