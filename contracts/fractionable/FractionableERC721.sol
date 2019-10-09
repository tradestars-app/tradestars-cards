pragma solidity ^0.5.8;

import "./IFractionableERC721.sol";

import "../utils/Administrable.sol";

import "../bondedERC20/IBondedERC20Helper.sol";
import "../bondedERC20/IBondedERC20Transfer.sol";

import "../lib/Strings.sol";
import "../lib/ERC20Manager.sol";

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC721/ERC721Full.sol";

contract FractionableERC721 is Administrable, ERC721Full, IFractionableERC721, IBondedERC20Transfer {

    using Strings for string;

    /// Helper contract for ERC20 transactions.
    IBondedERC20Helper private bondedHelper;

    /// Fungible tokens map
    mapping(uint256 => address) private fungiblesMap;

    /// Base token URI metadata.
    string public baseTokenUri;

    function initialize(
        string memory _name,
        string memory _symbol,
        string memory _baseUri,
        address _bondedHelper
    )
        public initializer
    {
        Administrable.initialize(msg.sender);

        ERC721.initialize();
        ERC721Enumerable.initialize();
        ERC721Metadata.initialize(_name, _symbol);

        _setBaseTokenUri(_baseUri);

        // Sets address for helper functions
        bondedHelper = IBondedERC20Helper(_bondedHelper);
    }

    /**
     * Get bonded ERC-20 contract address for a provided tokenId
     * @param _tokenId NFT token id
     */
    function getBondedERC20(uint256 _tokenId) public view returns (address) {
        return fungiblesMap[_tokenId];
    }

    /**
     * @dev Overrides the ERC721 function. Returns baseUri + tokenUri.
     * @param _tokenId provided tokenId
     */
    function tokenURI(uint256 _tokenId) public view returns (string memory) {
        require(_exists(_tokenId), "tokenId does not exists");
        return Strings.strConcat(baseTokenUri, Strings.uint2str(_tokenId));
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
        public
    {
        require(msg.sender == fungiblesMap[_tokenId], "Invalid tokenId");

        /// Log BondedERC20 transfer on this contract.
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
        public onlyAdmin
    {
        _mint(_beneficiary, _tokenId);

        /// Create ERC20 BondedERC20
        fungiblesMap[_tokenId] = ERC20Manager.deploy(
            _name,
            _symbol,
            _tokenId,
            address(this)
        );
    }

    /**
     * Mint BondedERC20 tokens.
     * @param _tokenId NFT token id.
     * @param _beneficiary beneficiary address of the minted ERC20 tokens.
     * @param _amount ERC20 tokens to mint.
     * @param _value in wei, expresed in utility tokens, equivalent to the BondedERC20 tokens to mint.
     */
    function mintBondedERC20(
        uint256 _tokenId,
        address _beneficiary,
        uint256 _amount,
        uint256 _value
    )
        public onlyAdmin
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
     * @param _amount ERC20 tokens to burn.
     * @param _value in wei, expresed in utility tokens, corresponding to the BondedERC20 tokens to burn.
     */
    function burnBondedERC20(
        uint256 _tokenId,
        address _burner,
        uint256 _amount,
        uint256 _value
    )
        public onlyAdmin
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
     *  from investing a value expresed in utility tokens.
     * @param _tokenId NFT token id.
     * @param _value in wei estimate how many BondedERC20 tokens will get
     */
    function estimateBondedERC20Tokens(
        uint256 _tokenId,
        uint256 _value
    )
        public view onlyAdmin returns (uint256)
    {
        address token_ = fungiblesMap[_tokenId];

        uint256 amount = bondedHelper.calculatePurchaseReturn(
            ERC20Manager.totalSupply(token_),
            ERC20Manager.poolBalance(token_),
            ERC20Manager.reserveRatio(token_),
            _value
        );

        return amount;
    }

    /**
     * @dev Estimates value, expressed in utility tokens, you would get
     *  from selling an amount of BondedERC20 tokens.
     * @param _tokenId NFT token id.
     * @param _amount in wei of BondedERC20 tokens to estimate value in return.
     */
    function estimateBondedERC20Value(
        uint256 _tokenId,
        uint256 _amount
    )
        public view onlyAdmin returns (uint256)
    {
        address token_ = fungiblesMap[_tokenId];

        require(_amount <= ERC20Manager.totalSupply(token_), "amount is > than contract total supply");

        uint256 value = bondedHelper.calculateSaleReturn(
            ERC20Manager.totalSupply(token_),
            ERC20Manager.poolBalance(token_),
            ERC20Manager.reserveRatio(token_),
            _amount
        );

        return value;
    }

    /**
     * @dev Updates the baseTokenUri of token metadata
     * @param _uri string of the base uri we'll use to concatenate
     */
    function _setBaseTokenUri(string memory _uri) internal {
        baseTokenUri = _uri;
    }
}