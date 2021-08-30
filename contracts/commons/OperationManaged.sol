// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";


contract OperationManaged is Ownable {

    constructor() Ownable() {}

    // Manager allowed address
    address private operationManager;

    /**
     * @dev Throws if called by any account other than the manager.
     */
    modifier onlyOperationManager() {
        require(msg.sender == operationManager, "caller is not allowed");
        _;
    }

    /**
     * @dev Sets the operation manager of the contract.
     * @param _manager address
     */
    function setOperationManager(address _manager) external onlyOwner {
        operationManager = _manager;
    }
}