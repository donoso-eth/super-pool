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
  uint256 public lastIncrement;
  uint256 public deploymentTimestamp;


  struct MockState {
  uint256  amountDeposited;
  uint256  lastTimestamp;
  uint256  incrementStored;
  uint256 lastIncrement;
  }


  constructor(address _superPool, address _token) {
    superPool = _superPool;
    owner = msg.sender;
    token = _token;
    deploymentTimestamp = block.timestamp;
  }

  function getState() external view returns (MockState memory state){
    console.log(lastTimestamp);
    console.log(amountDeposited);
    state= MockState(amountDeposited, lastTimestamp,incrementStored, lastIncrement);
  }


  function calculateStatus() external onlyFactory returns (uint256 incrementCalculated) {
    console.log(amountDeposited);
    if (amountDeposited == 0) {
      return 0;
    } else {
        uint256 currentIncrement = _getIncrement();
        lastIncrement = currentIncrement + incrementStored;
        incrementCalculated = lastIncrement;
        console.log(lastIncrement);
        incrementStored = 0;
   

    }
  }

  function _getIncrement() internal returns (uint256 increment) {

        uint256 newAPY = 500; // 1000 + block.timestamp % 1000;
        uint256 periodSpan = block.timestamp-lastTimestamp;
        console.log(periodSpan);

        if (lastTimestamp == 0) {
            periodSpan = 0;
        }

        increment =  (amountDeposited).mul(newAPY).mul(periodSpan).div(100).div(365).div(24).div(3600);
        console.log(increment);
        amountDeposited+= increment;
        lastTimestamp = block.timestamp;
        console.log(lastTimestamp);
    

  }


  function deposit(uint256 amount) external onlyFactory {
    
    incrementStored  += _getIncrement();
    
    amountDeposited += amount;

    console.log(78,token);
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
