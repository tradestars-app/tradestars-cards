pragma solidity ^0.5.12;

import "./Administrable.sol";

contract GasPriceLimited is Administrable {

    event GasPriceLimitChanged(address indexed account, uint256 value);

    uint256 public gasPriceLimit;

    // Limits max amount of gas for buy/sell Tx.
    modifier gasPriceLimited {
        require(tx.gasprice <= gasPriceLimit, "tx.gasprice is > than gasPriceLimit");
        _;
    }

    function setGasPriceLimit(uint256 value) external onlyAdmin {
        require(value > 0, "new price value should be greater than 0");
        gasPriceLimit = value;

        emit GasPriceLimitChanged(msg.sender, gasPriceLimit);
    }
}