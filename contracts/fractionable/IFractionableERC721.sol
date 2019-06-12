pragma solidity ^0.5.0;

interface IFractionableERC721 {

    event BurnBondedERC20(
        uint256 indexed tokenId,
        address indexed burner,
        uint256 value,
        uint256 amount
    );

    event MintBondedERC20(
        uint256 indexed tokenId,
        address indexed beneficiary,
        uint256 value,
        uint256 amount
    );

    event TransferBondedERC20(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 amount
    );

    function buyShares(uint256 _tokenId, uint256 _value) external;
    function sellShares(uint256 _tokenId, uint256 _amount) external;
    function estimateValue(uint256 _tokenId, uint256 _amount) external view returns (uint256);
    function estimateTokens(uint256 _tokenId, uint256 _value) external view returns (uint256);
}