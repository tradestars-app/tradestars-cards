pragma solidity ^0.5.0;

import "./Administrable.sol";

contract GasPriceLimited is Administrable {

    uint256 public gasPriceLimit = 26e9; // 26 Gwei

    // Limits max amount of gas for buy/sell Tx.
    modifier gasPriceLimited {
        require(tx.gasprice <= gasPriceLimit, "tx.gasPrice is > than gasPriceLimit");
        _;
    }

    function setGasPriceLimit(uint256 _gasPrice) public onlyAdmin {
        require(_gasPrice > 0, "_gasPrice should be greater than 0");
        gasPriceLimit = _gasPrice;
    }
}