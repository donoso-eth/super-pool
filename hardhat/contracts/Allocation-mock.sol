//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import {SafeERC20, IERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/SafeMath.sol";

contract AllocationMock {
  using SafeMath for uint256;

  address immutable superPool;
  address immutable owner;
  address token;

  uint256 public lastTimestamp;

  uint256 public deploymentTimestamp;
  uint256 public totalYield;
  uint256 public amountDeposited;

  uint256 public id;

  mapping(uint256 => MockState) public yieldByTimestamp;
  mapping(uint256 => uint256) public timestampbyId;

  struct MockState {
    uint256 amountDeposited;
    uint256 timestamp;
    uint256 totalYield;
    uint256 currentYield;
    uint256 id;
  }

  constructor(address _superPool, address _token) {
    superPool = _superPool;
    owner = msg.sender;
    token = _token;
    deploymentTimestamp = block.timestamp;
    yieldByTimestamp[block.timestamp] = MockState(0, block.timestamp, 0, 0, 0);
    totalYield = 0;
    timestampbyId[0] = block.timestamp;
  }

  function getState(uint256 _timestamp) external view returns (MockState memory state) {
    return yieldByTimestamp[_timestamp];
  }

  function getCurrentState() external view returns (MockState memory state) {
    return yieldByTimestamp[lastTimestamp];
  }

  function calculateStatus() public returns (uint256 yieldPeriod) {
    if (amountDeposited == 0) {
      yieldPeriod = 0;
    } else if (lastTimestamp == block.timestamp) {
      yieldPeriod = yieldByTimestamp[lastTimestamp].currentYield;
    } else {
      yieldPeriod = _getIncrement();
      totalYield += yieldPeriod;
      lastTimestamp = block.timestamp;
      id++;
      yieldByTimestamp[block.timestamp] = MockState(amountDeposited, block.timestamp, totalYield, yieldPeriod, id);
      timestampbyId[id] = block.timestamp;
    }
  }

  function _getIncrement() internal view returns (uint256 increment) {
    uint256 newAPY = 6; //block.timestamp % 20;
    uint256 periodSpan = block.timestamp - lastTimestamp;

    if (lastTimestamp == 0) {
      periodSpan = 0;
    }
    increment = (amountDeposited).mul(newAPY).mul(periodSpan).div(100).div(365).div(24).div(3600);
  }

  function deposit(uint256 amount) external onlyFactory {
    calculateStatus();

    amountDeposited += amount;

    SafeERC20.safeTransferFrom(IERC20(token), msg.sender, address(this), amount);
  }

  function withdraw(uint256 amount) external onlyFactory {
    require(amountDeposited >= amount, "NOT_ENOUGH_FUNDS");
    amountDeposited -= amount;
    SafeERC20.safeTransfer(IERC20(token), superPool, amount);
  }

  modifier onlyFactory() {
    require(msg.sender == superPool, "NOT_APPROUVED");
    _;
  }
}
