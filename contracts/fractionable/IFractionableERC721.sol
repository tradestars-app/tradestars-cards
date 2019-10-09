pragma solidity ^0.5.8;

interface IFractionableERC721 {

    event TransferBondedERC20(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 value
    );

    function getBondedERC20(uint256 _tokenId) external view returns(address);

    function mintToken(
        uint256 _tokenId,
        address _beneficiary,
        string calldata _symbol,
        string calldata _name
    )
        external;

    function mintBondedERC20(
        uint256 _tokenId,
        address _beneficiary,
        uint256 _amount,
        uint256 _value
    )
        external;

    function burnBondedERC20(
        uint256 _tokenId,
        address _burner,
        uint256 _amount,
        uint256 _value
    )
        external;

    function estimateBondedERC20Tokens(
        uint256 _tokenId,
        uint256 _value
    )
        external view returns (uint256);

    function estimateBondedERC20Value(
        uint256 _tokenId,
        uint256 _amount
    )
        external view returns (uint256);

}