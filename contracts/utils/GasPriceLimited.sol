// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./Administrable.sol";

contract GasPriceLimited is Administrable {

    event GasPriceLimitChanged(address indexed account, uint256 value);

    uint256 public gasPriceLimit;

    /**
     * @dev Enfoces the gasPriceLimit for contract transactions.
     */
    modifier gasPriceLimited {
        require(tx.gasprice <= gasPriceLimit, "tx.gasprice is > than gasPriceLimit");
        _;
    }

    /**
     * @dev limits the gasPrice a function can be called with
     *  called only by the admin 
     */
    function setGasPriceLimit(uint256 value) external onlyAdmin {
        require(value > 0, "new price value should be greater than 0");
        gasPriceLimit = value;

        emit GasPriceLimitChanged(msg.sender, gasPriceLimit);
    }
}
