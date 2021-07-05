// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface IFractionableERC721 {

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
