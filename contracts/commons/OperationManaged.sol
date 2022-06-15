// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/access/Ownable.sol";


contract OperationManaged is Ownable {

    constructor() Ownable() {}

    // Manager allowed addresses
    mapping(address => bool) private operationManagerHash;

    /**
     * @dev Throws if called by any account other than an op manager.
     */
    modifier onlyOperationManager() {
        require(operationManagerHash[msg.sender], "caller is not allowed");
        _;
    }

    /**
     * @dev Sets an operation manager of the contract.
     * @param _manager address
     */
    function setOperationManager(address _manager) external onlyOwner {
        operationManagerHash[_manager] = true;
    }

    /**
     * @dev Removes operation manager of the contract.
     * @param _manager address
     */
    function removeOperationManager(address _manager) external onlyOwner {
        operationManagerHash[_manager] = false;
    }
}