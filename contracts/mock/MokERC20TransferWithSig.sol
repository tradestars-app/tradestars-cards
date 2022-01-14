// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { TransferWithSigERC20 } from "../erc20/TransferWithSigERC20.sol";

contract MockERC20TransferWithSig is TransferWithSigERC20 {
    
    constructor() ERC20("MOCKERC20", "MOCK") {

    }

    function mint(address _to, uint256 _value) public virtual {
        _mint(_to, _value);
    }
}