// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IBondedERC20Transfer {
    function bondedERC20Transfer(
        uint256 _tokenId,
        address _from,
        address _to,
        uint256 _amount
    ) external;
    
    event TransferBondedERC20(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 value
    );
}
