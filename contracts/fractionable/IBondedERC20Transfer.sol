pragma solidity ^0.5.0;

interface IBondedERC20Transfer {
    function bondedERC20Transfer(uint256 _tokenId, address _from, address _to, uint256 _amount) external;
}