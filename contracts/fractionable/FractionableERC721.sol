// SPDX-License-Identifier: MIT

pragma solidity ^0.6.8;

import "./IFractionableERC721.sol";

import "../bondedERC20/IBondedERC20Helper.sol";
import "../bondedERC20/IBondedERC20Transfer.sol";

import "../lib/ERC20Manager.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC721/ERC721.sol";


contract FractionableERC721 is Ownable, ERC721, IFractionableERC721, IBondedERC20Transfer {

    // Helper contract for ERC20 transactions.
    IBondedERC20Helper private bondedHelper;

    // Fungible tokens map
    mapping(uint256 => address) private fungiblesMap;

    // Token Manager allowed address
    address private tokenManager;

    /**
     * @dev Throws if called by any account other than the manger.
     */
    modifier onlyTokenManager() {
        require(msg.sender == tokenManager, "msg.sender is not tokenManager");
        _;
    }

    constructor(
        address _bondedHelper,
        string memory _name,
        string memory _symbol
    )
        public Ownable() ERC721(_name, _symbol)
    {
        // Sets address for helper functions
        bondedHelper = IBondedERC20Helper(_bondedHelper);
    }

    /**
     * @dev Sets the token manager of the contract.
     * @param _manager address
     */
    function setTokenManager(address _manager) public onlyOwner {
        tokenManager = _manager;
    }

    /**
     * @dev Sets the bonded helper of the contract.
     * @param _helper address
     */
    function setBondedHelper(address _helper) public onlyOwner {
        bondedHelper = IBondedERC20Helper(_helper);
    }

    /**
     * @dev Sets bondedToken reserveRatio
     * @param _tokenId address
     * @param _reserveRatio value
     */
    function setBondedTokenReserveRatio(
        uint256 _tokenId,
        uint32 _reserveRatio
    )
        public onlyOwner
    {
        require(
            fungiblesMap[_tokenId] != address(0),
            "FractionableERC721: invalid _tokenId"
        );

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
        public override onlyTokenManager
    {
        _mint(_beneficiary, _tokenId);

        // Create ERC20 BondedERC20
        fungiblesMap[_tokenId] = ERC20Manager.deploy(
            _name,
            _symbol,
            _tokenId
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
        public override onlyTokenManager
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
        public override onlyTokenManager
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
        public view override returns (uint256)
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
     * @dev Estimates value, expressed in reserve tokens, you would get
     *  from selling an amount of BondedERC20 tokens.
     * @param _tokenId NFT token id.
     * @param _amount in wei of BondedERC20 tokens owner would sale
     */
    function estimateBondedERC20Value(
        uint256 _tokenId,
        uint256 _amount
    )
        public view override returns (uint256)
    {
        address token_ = fungiblesMap[_tokenId];

        require(
            _amount <= ERC20Manager.totalSupply(token_),
            "FractionableERC721: amount is > than contract total supply"
        );

        uint256 value = bondedHelper.calculateSaleReturn(
            ERC20Manager.totalSupply(token_),
            ERC20Manager.poolBalance(token_),
            ERC20Manager.reserveRatio(token_),
            _amount
        );

        return value;
    }

    /**
     * @dev Get bonded ERC-20 contract address for a provided tokenId
     * @param _tokenId NFT token id
     */
    function getBondedERC20(uint256 _tokenId) public view override returns (address) {
        return fungiblesMap[_tokenId];
    }
}
