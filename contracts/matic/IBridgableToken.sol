// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";


interface IBridgableToken is IERC20 {
    function burn(uint256 _amount) external;
    function mint(address _to, uint256 _amount) external;
}
