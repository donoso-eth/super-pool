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
  uint256 public amountDeposited;
  uint256 public lastTimestamp;
  uint256 public incrementStored;
  uint256 public APY;


  struct MockState {
  uint256  amountDeposited;
  uint256  lastTimestamp;
  uint256  incrementStored;
  }


  constructor(address _superPool, address _token) {
    superPool = _superPool;
    owner = msg.sender;
    token = _token;
  }

  function getState() external view returns (MockState memory state){

    state= MockState(amountDeposited, lastTimestamp,incrementStored);
  }


  function calculateStatus() external onlyFactory returns (uint256) {
    if (amountDeposited == 0) {
      return 0;
    } else {
        uint256 currentIncrement = _getIncrement();
        uint256 increment = currentIncrement + incrementStored;
        incrementStored = 0;
        return increment;

    }
  }

  function _getIncrement() internal returns (uint256 increment) {

      
        uint256 periodSpan = block.timestamp-lastTimestamp;

        if (lastTimestamp == 0) {
            periodSpan = 0;
        }

        increment =  (amountDeposited).mul(APY).mul(periodSpan).div(100).div(365).div(24).div(3600);
        amountDeposited+= increment;
        lastTimestamp = block.timestamp;
    

  }

  function changeAPY() public {
      uint256 newAPY = 500; // 1000 + block.timestamp % 1000;
  }


  function deposit(uint256 amount) external onlyFactory {
    
    incrementStored  += _getIncrement();
    
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
