pragma solidity ^0.5.8;

interface IBondedERC20Transfer {
    function bondedERC20Transfer(uint256 tokenId, address from, address to, uint256 amount) external;
}