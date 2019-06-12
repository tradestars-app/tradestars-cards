pragma solidity ^0.5.0;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";

import "../utils/Administrable.sol";
import "../utils/GasPriceLimited.sol";
import "../fractionable/FractionableERC721.sol";

contract PerformanceCollection is Administrable, FractionableERC721, GasPriceLimited {

    using SafeMath for uint256;

    event LogUpdateCollection(uint256 indexed collectionId, uint256 indexed cardId, uint256 shares);

    struct CollectionInfo {
        /// Total shares in this collection
        uint256 totalShares;

        /// Performance Card ids Array
        uint256[] cardIdArray;

        /// Mapping of cardId -> shares amount.
        mapping(uint256 => uint256) sharesMap;

        /// Mapping of cardId -> cardIdArray[index].
        mapping(uint256 => uint256) sharesIndexMap;

        /// Token ownerships mapping.
        mapping(address => mapping(uint256 => uint256)) ownershipMap;

        /// We'll keep the ownership of tokens for a user here.
        mapping(address => uint256[]) ownershipArrayMap;
    }

    mapping(uint256 => CollectionInfo) collectionsInfoMap;

    // Performance Card registry
    FractionableERC721 private cardsRegistry;

    /// TS Token
    IERC20 private constant tsToken = IERC20(0);

    /**
     * @dev Create a new Performance Collection.
     * @param _collectionId the id of the NFT collection
     * @param _symbol The symbol of this collection
     * @param _name The name of this collection
     * @param _cardIdArray array of Performance Card token ids
     * @param _cardIdSharesArray array of Performance Card shares amount
     * @param _msgHash hash of card parameters
     * @param _signature admin signature
     * @param _cardValue creation value for the card
     */
    function createCollection(
        uint256 _collectionId,
        string calldata _symbol,
        string calldata _name,
        uint256[] calldata _cardIdArray,
        uint256[] calldata _cardIdSharesArray,
        bytes32 _msgHash,
        bytes calldata _signature,
        uint256 _cardValue
    )
        external gasPriceLimited
    {
        // Check hashed message & admin signature
        bytes32 checkHash = keccak256(
            abi.encodePacked(_collectionId, _name, _symbol, _cardIdArray, _cardIdSharesArray)
        );
        require(checkHash == _msgHash, "invalid msgHash");
        require(_isValidAdminHash(_msgHash, _signature), "invalid admin signature");

        /// Check the sender has the required TS balance
        _requireBalance(msg.sender, tsToken, _cardValue);

        /// Burn the card value in TS tokens
        require(
            tsToken.transferFrom(msg.sender, address(0), _cardValue),
            "tsToken.transferFrom(msg.sender, address(0), _cardValue)"
        );

        // Mint Collection Card
        _mintToken(_collectionId, msg.sender, _symbol, _name);

        // Fill items
        for (uint i = 0; i < _cardIdArray.length; i++) {
            _addToCollection(_collectionId, _cardIdArray[i], _cardIdSharesArray[i]);
        }
    }

    /**
     * @dev Buy shares of the given collectionId.
     * @param _collectionId the id of the NFT collection
     */
    function buyShares(uint256 _collectionId, uint256 _value) external gasPriceLimited {
        require(_exists(_collectionId), "collection not created");
        require(_value > 0, "value should be > 0");

        /// Check the sender has the required balance in TS
        _requireBalance(msg.sender, tsToken, _value);

        /// Check that the token transferFrom has succeeded
        require(
            tsToken.transferFrom(msg.sender, address(this), _value),
            "tsToken.transferFrom(msg.sender, address(this), srcQty) failed"
        );

        CollectionInfo storage cinfo = collectionsInfoMap[_collectionId];

        address buyer = msg.sender;
        uint256 tokensAmount = 0;

        for (uint i = 0; i < cinfo.cardIdArray.length; i++) {
            uint256 cardId = cinfo.cardIdArray[i];
            uint256 cardShares = cinfo.sharesMap[cardId];

            // Calculate amount per individual token.
            uint256 unitaryInvestment = _value.mul(cardShares).div(cinfo.totalShares);
            uint256 buyAmount = cardsRegistry.estimateTokens(cardId, unitaryInvestment);

            // Buy Shares.
            cardsRegistry.buyShares(cardId, unitaryInvestment);

            // Save amount of issued tokens in internal mappings.
            if (cinfo.ownershipMap[buyer][cardId] == 0) {
                cinfo.ownershipArrayMap[buyer].push(cardId);
            }
            cinfo.ownershipMap[buyer][cardId] = cinfo.ownershipMap[buyer][cardId].add(buyAmount);

            tokensAmount = tokensAmount.add(buyAmount);
        }

        // Issue ERC20 collection tokens representing invested value.
        _mintBondedERC20(_collectionId, buyer, tokensAmount, _value);
    }

    /**
     * @dev Sell shares of the given collectionId.
     * @param _collectionId the id of the NFT collection
     * @param _amount The amount of shares to sell
     */
    function sellShares(uint256 _collectionId, uint256 _amount) external gasPriceLimited {
        require(_exists(_collectionId), "collection not created");
        require(_amount > 0, "amout should be > 0");

        CollectionInfo storage cinfo = collectionsInfoMap[_collectionId];

        address seller = msg.sender;

        // Get total balance for this sender
        uint256 totalAmount = _getFungible(_collectionId).balanceOf(seller);
        uint256 totalSellValue = 0;

        require(_amount <= totalAmount, "sell amount should be <= balance");

        for (uint i = 0; i < cinfo.ownershipArrayMap[seller].length; i++) {
            uint256 cardId = cinfo.ownershipArrayMap[seller][i];

            // Calculate sell amount of individual token
            uint256 unitaryAmount = _amount.mul(cinfo.ownershipMap[seller][cardId]).div(totalAmount);
            uint256 sellValue = cardsRegistry.estimateValue(cardId, unitaryAmount);

            // Sell shares
            cardsRegistry.sellShares(cardId, unitaryAmount);

            // Remove to be burned tokens from internal mappings.
            cinfo.ownershipMap[seller][cardId] = cinfo.ownershipMap[seller][cardId].sub(unitaryAmount);

            // If the user sold all these tokens, remove from seller array.
            if (cinfo.ownershipMap[seller][cardId] == 0) {
                // Reorg array
                uint256 lastIndex = cinfo.ownershipArrayMap[seller].length.sub(1);

                cinfo.ownershipArrayMap[seller][i] = cinfo.ownershipArrayMap[seller][lastIndex];
                cinfo.ownershipArrayMap[seller][lastIndex] = 0;
                cinfo.ownershipArrayMap[seller].length--;
            }

            // Add unitary sold value
            totalSellValue = totalSellValue.add(sellValue);
        }

        /// Burn ERC20 collection tokens representing invested value.
        _burnBondedERC20(_collectionId, seller, _amount, totalSellValue);

        /// Send TS tokens to sellet
        require(
            tsToken.transfer(msg.sender, totalSellValue),
            "tsToken.transfer(msg.sender, totalSellValue) failed"
        );
    }

    /**
     * @dev Update an existing collection item.
     * @param _collectionId the id of the NFT collection
     * @param _cardId The performance card id.
     * @param _shares The number of shares representing the cardId. if 0 will delete the item.
     */
    function updateCollection(
        uint256 _collectionId,
        uint256 _cardId,
        uint256 _shares
    )
        external onlyAdmin
    {
        CollectionInfo storage cinfo = collectionsInfoMap[_collectionId];

        require(_exists(_collectionId), "collection does not exists");
        require(cinfo.sharesMap[_cardId] != 0, "cardId is not on this collection");

        // Substract current shares values from collection total shares
        uint256 currentShares = cinfo.sharesMap[_cardId];
        cinfo.totalShares = cinfo.totalShares.sub(currentShares);

        // Delete cardId from this collection
        if (_shares == 0) {

            uint256 index = cinfo.sharesIndexMap[_cardId];
            uint256 lastIndex = cinfo.cardIdArray.length.sub(1);

            delete cinfo.sharesMap[_cardId];
            delete cinfo.sharesIndexMap[_cardId];

            // reorg index array
            cinfo.cardIdArray[index] = cinfo.cardIdArray[lastIndex];

            // We moved the last array item to removed item index in array.
            // update new index in array for the moved item.
            uint256 lastItem = cinfo.cardIdArray[index];
            cinfo.sharesIndexMap[lastItem] = index;

            // Delete last array item
            cinfo.cardIdArray[lastIndex] = 0;
            cinfo.cardIdArray.length--;

        // update new shares values and add the amount to the total shares values.
        } else {
            cinfo.sharesMap[_cardId] = _shares;
            cinfo.totalShares = cinfo.totalShares.add(_shares);
        }

        emit LogUpdateCollection(_collectionId, _cardId, _shares);
    }

    // Initialize function
    function initialize(
        address _sender,
        address _cardsRegistry,
        address _bondedHelper
    )
        public initializer
    {
        Administrable.initialize(_sender);

        FractionableERC721.initialize(
            "TradeStars Performance Collection Registry",
            "TSCOLL",
            "https://api.tradestars.app/collections/",
            _bondedHelper
        );

        // Set up Performance Card registry
        cardsRegistry = FractionableERC721(_cardsRegistry);
    }

    /**
     * Estimate an amount of tokens you would get from a wei investment in a given tokenId
     * @param _collectionId NFT tokenId
     * @param _value wei amount
     */
    function estimateTokens(uint256 _collectionId, uint256 _value) external view returns (uint256) {
        CollectionInfo storage cinfo = collectionsInfoMap[_collectionId];

        uint256 tsTokensLen = cinfo.cardIdArray.length;
        uint256 totalShares = cinfo.totalShares;
        uint256 tokensAmount = 0;

        for (uint i = 0; i < tsTokensLen; i++) {
            uint256 cardId = cinfo.cardIdArray[i];
            uint256 cardShares = cinfo.sharesMap[cardId];

            uint256 unitaryValue = _value.mul(cardShares).div(totalShares);
            uint256 buyAmount = cardsRegistry.estimateTokens(cardId, unitaryValue);

            tokensAmount = tokensAmount.add(buyAmount);
        }
        return tokensAmount;
    }

    /**
     * Estimate value in reserve you would get from selling amount of the given collectionId
     * @param _collectionId NFT collectionId
     * @param _amount wei amount
     */
    function estimateValue(uint256 _collectionId, uint256 _amount) external view returns (uint256) {
        CollectionInfo storage cinfo = collectionsInfoMap[_collectionId];

        address seller = msg.sender;
        uint256 tsTokensLen = cinfo.ownershipArrayMap[seller].length;

        // Get total balance for this sender
        uint256 totalAmount = _getFungible(_collectionId).balanceOf(seller);
        uint256 totalSellValue = 0;

        for (uint i = 0; i < tsTokensLen; i++) {
            uint256 cardId = cinfo.ownershipArrayMap[seller][i];

            // Calculate sell amount of individual token
            uint256 unitaryAmount = _amount.mul(cinfo.ownershipMap[seller][cardId]).div(totalAmount);
            uint256 sellValue = cardsRegistry.estimateValue(cardId, unitaryAmount);

            totalSellValue = totalSellValue.add(sellValue);
        }
        return totalSellValue;
    }

    /**
     * @dev Add a new Performance Card to the Collection Card.
     * @param _collectionId the id of the Collection Card NFT
     * @param _cardId The Performance Card id.
     * @param _shares The number of shares representing the Performance Card in this collection
     */
    function _addToCollection(
        uint256 _collectionId,
        uint256 _cardId,
        uint256 _shares
    )
        private
    {
        CollectionInfo storage cinfo = collectionsInfoMap[_collectionId];

        require(_shares > 0, "shares value should be > 0");
        require(cardsRegistry.ownerOf(_cardId) != address(0), "cardId does not exists");

        // Add shares and index.
        cinfo.sharesMap[_cardId] = _shares;
        cinfo.sharesIndexMap[_cardId] = cinfo.cardIdArray.length;

        cinfo.cardIdArray.push(_cardId);
        cinfo.totalShares = cinfo.totalShares.add(_shares);
    }

    /**
     * @dev Check if the sender has balance and the contract has enough allowance
     *  to use sender ERC20 on his belhalf
     * @param _sender - address of sender
     * @param _token - ERC20 token registry
     * @param _amount - uint256 of amount of tokens
     */
    function _requireBalance(address _sender, IERC20 _token, uint256 _amount) internal view {
        require(_token.balanceOf(_sender) >= _amount, "Insufficient funds");
        require(_token.allowance(_sender, address(this)) >= _amount, "Insufficient allowance");
    }
}