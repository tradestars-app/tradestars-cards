// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IFractionableERC721.sol";

import "../bondedERC20/IBondedERC20Helper.sol";
import "../bondedERC20/IBondedERC20Transfer.sol";

import "../lib/ERC20Manager.sol";
import "../commons/OperationManaged.sol";

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract FractionableERC721 is 
    OperationManaged, 
    ERC721, 
    IFractionableERC721, 
    IBondedERC20Transfer 
{
    // Helper contract for ERC20 transactions.
    IBondedERC20Helper private bondedHelper;

    // Fungible tokens map
    mapping(uint256 => address) private fungiblesMap;

    // Default reserve ratio for bonded contracts
    uint32 private bondedTokensDefaultRR = 333333;

    constructor(
        address _bondedHelper,
        string memory _name,
        string memory _symbol
    )
        ERC721(_name, _symbol)
    {
        // Sets address for helper functions
        bondedHelper = IBondedERC20Helper(_bondedHelper);
    }

    /**
     * @dev Sets the bonded helper of the contract.
     * @param _helper address
     */
    function setBondedHelper(address _helper) external onlyOwner {
        bondedHelper = IBondedERC20Helper(_helper);
    }

    /**
     * @dev Sets the bonded tokens default ratio for new contracts
     * @param _ratio default new ratio
     */
    function setBondedTokensDefaultRR(uint32 _ratio) external onlyOwner {
        require(
            _ratio > 1 && _ratio <= 1000000,
            "FractionableERC721: invalid _ratio"
        );
        bondedTokensDefaultRR = _ratio;
    }

    /**
     * @dev Sets bondedToken reserveRatio
     * @param _tokenId address
     * @param _reserveRatio value
     */
    function setBondedTokenRR(
        uint256 _tokenId,
        uint32 _reserveRatio
    )
        external onlyOwner
    {
        ERC20Manager.setReserveRatio(
            fungiblesMap[_tokenId],
            _reserveRatio
        );
    }

    /**
     * Bonded ERC20 transfer event hook. Can only be called from BondedERC20 contracts
     */
    function bondedERC20Transfer(
        uint256 _tokenId,
        address _from,
        address _to,
        uint256 _amount
    )
        public override
    {
        require(
            msg.sender == fungiblesMap[_tokenId],
            "FractionableERC721: Invalid tokenId"
        );

        // Log BondedERC20 transfer on this contract.
        emit TransferBondedERC20(_tokenId, _from, _to, _amount, 0);
    }

    /**
     * Mint a new FractionableToken.
     * @param _tokenId NFT token id.
     * @param _beneficiary of the new created token
     * @param _symbol NFT token symbol.
     * @param _name NFT token name.
     */
    function mintToken(
        uint256 _tokenId,
        address _beneficiary,
        string memory _symbol,
        string memory _name
    )
        external override onlyOperationManager
    {
        _mint(_beneficiary, _tokenId);

        // Create ERC20 BondedERC20
        fungiblesMap[_tokenId] = ERC20Manager.deploy(
            _name,
            _symbol,
            _tokenId, 
            bondedTokensDefaultRR
        );
    }

    /**
     * Mint BondedERC20 tokens.
     * @param _tokenId NFT token id.
     * @param _beneficiary beneficiary address of the minted ERC20 tokens.
     * @param _amount ERC20 fractional tokens to mint.
     * @param _value in wei, expresed in reserve tokens
     */
    function mintBondedERC20(
        uint256 _tokenId,
        address _beneficiary,
        uint256 _amount,
        uint256 _value
    )
        external override onlyOperationManager
    {
        ERC20Manager.mint(
            fungiblesMap[_tokenId],
            _beneficiary,
            _amount,
            _value
        );

        emit TransferBondedERC20(_tokenId, address(0), _beneficiary, _amount, _value);
    }

    /**
     * Burn BondedERC20 tokens.
     * @param _tokenId NFT token id.
     * @param _burner address of the tokens holder.
     * @param _amount ERC20 fractional tokens to burn.
     * @param _value in wei, expresed in reserve tokens
     */
    function burnBondedERC20(
        uint256 _tokenId,
        address _burner,
        uint256 _amount,
        uint256 _value
    )
        external override onlyOperationManager
    {
        ERC20Manager.burn(
            fungiblesMap[_tokenId],
            _burner,
            _amount,
            _value
        );

        emit TransferBondedERC20(_tokenId, _burner, address(0), _amount, _value);
    }

    /**
     * @dev Estimates amount of BondedERC20 tokens you would get
     *  from investing a value expresed in reserve tokens.
     * @param _tokenId NFT token id.
     * @param _value wei value in reserve tokens
     */
    function estimateBondedERC20Tokens(
        uint256 _tokenId,
        uint256 _value
    )
        external view override returns (uint256)
    {
        address token_ = fungiblesMap[_tokenId];

        return bondedHelper.calculatePurchaseReturn(
            ERC20Manager.totalSupply(token_),
            ERC20Manager.poolBalance(token_),
            ERC20Manager.reserveRatio(token_),
            _value
        );
    }

    /**
     * @dev Estimates value, expressed in reserve tokens, you would get
     *  from selling an amount of BondedERC20 tokens.
     * @param _tokenId NFT token id.
     * @param _amount in wei of BondedERC20 tokens owner would sale
     */
    function estimateBondedERC20Value(
        uint256 _tokenId,
        uint256 _amount
    )
        external view override returns (uint256)
    {
        address token_ = fungiblesMap[_tokenId];

        return bondedHelper.calculateSaleReturn(
            ERC20Manager.totalSupply(token_),
            ERC20Manager.poolBalance(token_),
            ERC20Manager.reserveRatio(token_),
            _amount
        );
    }

    /**
     * @dev Get bonded ERC-20 contract address for a provided tokenId
     * @param _tokenId NFT token id
     */
    function getBondedERC20(uint256 _tokenId) external view override returns (address) {
        return fungiblesMap[_tokenId];
    }
}
