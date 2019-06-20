pragma solidity ^0.5.0;

interface IFractionableERC721 {

    event TransferBondedERC20(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 value
    );

    function buyShares(uint256 _tokenId, uint256 _value) external;
    function sellShares(uint256 _tokenId, uint256 _amount) external;
    function estimateValue(uint256 _tokenId, uint256 _amount) external view returns (uint256);
    function estimateTokens(uint256 _tokenId, uint256 _value) external view returns (uint256);
}