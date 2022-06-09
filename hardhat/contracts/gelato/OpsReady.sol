// SPDX-License-Identifier: UNLICENSED
pragma solidity ^0.8.0;

import {
    SafeERC20,
    IERC20
} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import { IOps } from "./IOps.sol";
import {Initializable} from "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";

abstract contract OpsReady is Initializable {
    address public  ops;
    address payable public  gelato;
    address public constant ETH = 0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE;

    modifier onlyOps() {
        require(msg.sender == ops, "OpsReady: onlyOps");
        _;
    }

    constructor() {
  
    }

      /**
   * @notice initializer of the contract/oracle
   */
  function initialize(address _ops
  ) external initializer {
        ops = _ops;
        gelato = IOps(_ops).gelato();
  }


    function _transfer(uint256 _amount, address _paymentToken) internal {
        if (_paymentToken == ETH) {
            (bool success, ) = gelato.call{value: _amount}("");
            require(success, "_transfer: ETH transfer failed");
        } else {
            SafeERC20.safeTransfer(IERC20(_paymentToken), gelato, _amount);
        }
    }
}
