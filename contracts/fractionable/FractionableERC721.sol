pragma solidity ^0.5.0;

import "openzeppelin-eth/contracts/token/ERC721/ERC721Full.sol";

import "./IFractionableERC721.sol";
import "./IBondedERC20Transfer.sol";
import "./IBondedERC20Helper.sol";
import "./BondedERC20.sol";

import "../lib/Strings.sol";

contract FractionableERC721 is ERC721Full, IBondedERC20Transfer, IFractionableERC721 {

    using Strings for string;

    /// Helper contract for ERC20 transactions.
    IBondedERC20Helper private bondedHelper;

    /// Fungible tokens map
    mapping(uint256 => BondedERC20) private fungiblesMap;

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
        ERC721.initialize();
        ERC721Enumerable.initialize();
        ERC721Metadata.initialize(_name, _symbol);

        _setBaseTokenUri(_baseUri);

        // Sets address for helper functions
        bondedHelper = IBondedERC20Helper(_bondedHelper);
    }

    /**
     * @dev Overrides the ERC721 function. Returns baseUri + tokenUri.
     * @param _tokenId provided tokenId
     */
    function tokenURI(uint256 _tokenId) external view returns (string memory) {
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
        external
    {
        require(BondedERC20(msg.sender) == fungiblesMap[_tokenId], "Invalid tokenId");

        /// Log ERC20 transfer on this contract.
        emit TransferBondedERC20(
            _tokenId,
            _from,
            _to,
            _amount
        );
    }

    /**
     * Mint a new FractionableToken. This is an internal function and wont check paramers.
     * @param _tokenId NFT token id.
     * @param _beneficiary of the new created token
     * @param _symbol NFT token symbol.
     * @param _name NFT token name.
     */
    function _mintToken(
        uint256 _tokenId,
        address _beneficiary,
        string memory _symbol,
        string memory _name
    )
        internal
    {
        _mint(_beneficiary, _tokenId);

        /// Create ERC20 BondedERC20
        fungiblesMap[_tokenId] = new BondedERC20(
            _name,
            _symbol,
            _tokenId,
            address(this)
        );
    }

    /**
     * Mint BondedERC20 tokens. This is an internal function and wont check paramers.
     * @param _tokenId NFT token id.
     * @param _beneficiary beneficiary address of the minted ERC20 tokens.
     * @param _amount ERC20 tokens to mint.
     * @param _value in wei corresponding to the ERC20 tokens to mint.
     */
    function _mintBondedERC20(
        uint256 _tokenId,
        address _beneficiary,
        uint256 _amount,
        uint256 _value
    )
        internal
    {
        _getFungible(_tokenId).mint(
            _beneficiary,
            _amount,
            _value
        );

        emit MintBondedERC20(_tokenId, _beneficiary, _value, _amount);
        emit TransferBondedERC20(_tokenId, address(0), _beneficiary, _amount);
    }

    /**
     * Burn BondedERC20 tokens. This is an internal function and wont check paramers.
     * @param _tokenId NFT token id.
     * @param _burner address of the tokens holder.
     * @param _amount ERC20 tokens to burn.
     * @param _value in wei corresponding to the ERC20 tokens to burn.
     */
    function _burnBondedERC20(
        uint256 _tokenId,
        address _burner,
        uint256 _amount,
        uint256 _value
    )
        internal
    {
        _getFungible(_tokenId).burn(
            _burner,
            _amount,
            _value
        );

        emit BurnBondedERC20(_tokenId, _burner, _value, _amount);
        emit TransferBondedERC20(_tokenId, _burner, address(0), _amount);
    }

    /**
     * @dev Estimate amount of BondedERC20 you would get for an wei investment.
     * @param _tokenId NFT token id.
     * @param _value in wei estimate how many BondedERC20 tokens will get
     */
    function _estimateBondedERC20Tokens(
        uint256 _tokenId,
        uint256 _value
    )
        internal view returns (uint256)
    {
        BondedERC20 token_ = _getFungible(_tokenId);

        uint256 amount = bondedHelper.calculatePurchaseReturn(
            token_.totalSupply(),
            token_.poolBalance(),
            token_.reserveRatio(),
            _value
        );

        return amount;
    }

    /**
     * @dev Estimate value in wei you would get for burning BondedERC20.
     * @param _tokenId NFT token id.
     * @param _amount of BondedERC20 tokens to estimate value in wei in return.
     */
    function _estimateBondedERC20Value(
        uint256 _tokenId,
        uint256 _amount
    )
        internal view returns (uint256)
    {
        BondedERC20 token_ = _getFungible(_tokenId);

        require(_amount <= token_.totalSupply(), "amount is > than contract total supply");

        uint256 value = bondedHelper.calculateSaleReturn(
            token_.totalSupply(),
            token_.poolBalance(),
            token_.reserveRatio(),
            _amount
        );

        return value;
    }

    /**
     * Get fungible token address for a provided tokenId
     * @param _tokenId NFT token id
     */
    function _getFungible(uint256 _tokenId) internal view returns (BondedERC20) {
        return fungiblesMap[_tokenId];
    }

    /**
     * @dev Updates the baseTokenUri of token metadata
     * @param _uri string of the base uri we'll use to concatenate
     */
    function _setBaseTokenUri(string memory _uri) internal {
        baseTokenUri = _uri;
    }
}