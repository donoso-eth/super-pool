// SPDX-License-Identifier: AGPLv3
pragma solidity 0.8.17;

/**
 * @title UUPS (Universal Upgradeable Proxy Standard) Proxiable contract.
 */
interface IUUPSProxiable {
  /**
   * @dev Get current implementation code address.
   */
  function getCodeAddress() external view returns (address codeAddress);

  function updateCode(address newAddress) external ;

  /**
   * @dev Proxiable UUID marker function, this would help to avoid wrong logic
   *      contract to be used for upgrading.
   *
   * NOTE: The semantics of the UUID deviates from the actual UUPS standard,
   *       where it is equivalent of _IMPLEMENTATION_SLOT.
   */
  function proxiableUUID() external view returns (bytes32);

  /**
   * @dev Update code address function.
   *      It is internal, so the derived contract could setup its own permission logic.
   */
}
