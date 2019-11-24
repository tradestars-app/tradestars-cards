pragma solidity ^0.5.12;

import "./ICard.sol";

import "../lib/Strings.sol";
import "../lib/ERC20Manager.sol";

import "../utils/Administrable.sol";
import "../utils/GasPriceLimited.sol";

import "../dex/ITConverter.sol";
import "../fractionable/IFractionableERC721.sol";

import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";

/// Simple
interface EIP712 {
    function transferWithSig(
        bytes calldata sig,
        uint256 tokenIdOrAmount,
        bytes32 data,
        uint256 expiration,
        address to
    ) external returns (address);
}

/// Simple ERC721 interface

interface IERC721Simple {
    function ownerOf(uint256 tokenId) external view returns (address owner);
}

/// Main Contract

contract PerformanceCard is Administrable, ICard, GasPriceLimited {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// .0001 precision.
    uint32 public constant MATH_PRECISION = 1e4;

    /// Constant values for creating bonded ERC20 tokens.
    uint256 public constant ERC20_INITIAL_SUPPLY = 100000e18; // 100000 units
    uint256 public constant ERC20_INITIAL_POOL_SHARE = 250; // 2.5%

    /// Platform fee
    uint16 public constant GAME_INVESTMENT_FEE = 75; // 0.75%

    /// Investment fee
    uint16 public constant OWNER_INVESTMENT_FEE = 175; // 1.75%

    /// TS Token
    IERC20 private tsToken;

    /// Reserve Token. (USDT)
    IERC20 private reserveToken;

    /// Converter
    ITConverter private tConverter;

    /// Converter
    IFractionableERC721 private nftRegistry;

    /// Mapping for player scores
    mapping(uint256 => uint32) private cardScoresMap;

    /// Base card URI metadata.
    string public baseUrlPath;


    /**
     * @dev Initializer for PerformanceCard contract
     * @param _nftRegistry - NFT Registry address
     * @param _tConverter - TConverter address
     * @param _tsToken - TS token registry address
     * @param _reserveToken - Reserve registry address
     */
     function initialize(
        address _owner,
        address _nftRegistry,
        address _tConverter,
        address _tsToken,
        address _reserveToken
    )
        public initializer
    {
        Administrable.initialize(_owner);

        /// Set the NFT Registry
        nftRegistry = IFractionableERC721(_nftRegistry);

        /// Set TS and Reseve Token addresses
        tsToken = IERC20(_tsToken);
        reserveToken = IERC20(_reserveToken);

        /// Set converter contract.
        tConverter = ITConverter(_tConverter);

        /// sets the base URL for cards metadata
        baseUrlPath = "https://api.tradestars.app/cards/";
    }

    /**
     * @dev Gets the metadata URL for the card
     * @param _tokenId to get the URL for
     */
    function getCardURL(uint256 _tokenId) public view returns (string memory) {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exist");
        return Strings.strConcat(baseUrlPath, Strings.uint2str(_tokenId));
    }

    /**
     * @dev Gets the bonded ERC20 for the card
     * @param _tokenId to get bondedToken for
     */
    function getBondedERC20(uint256 _tokenId) public view returns (address) {
        return nftRegistry.getBondedERC20(_tokenId);
    }

     /**
     * @dev Sets the base URL path for cards metadata URLs.
     * @param _baseUrlPath for the tokens metadata
     */
    function setBaseUrlPath(string memory _baseUrlPath) public onlyAdmin {
        baseUrlPath = _baseUrlPath;
    }

    /**
     * @dev Bulk update scores for tokenIds
     * @param _tokenId tokenId to query for
     */
    function getScore(uint256 _tokenId) external view returns (uint256) {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exists");
        return cardScoresMap[_tokenId];
    }

    /**
     * @dev Updates Score of given tokenId.
     * @param _tokenId tokenId to update
     * @param _score scores
     */
    function updateScore(uint256 _tokenId, uint32 _score) public onlyAdmin {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId not created");
        require(_score > 0 && _score <= (100 * MATH_PRECISION), "invalid score");

        cardScoresMap[_tokenId] = _score;
    }

    /**
     * @dev Bulk update scores for tokenIds
     * @param _tokenIds uint256 array of tokenIds to update
     * @param _scores uint32 array of scores
     */
    function updateScoresBulk(
        uint256[] calldata _tokenIds,
        uint32[] calldata _scores
    )
        external onlyAdmin
    {
        require(_tokenIds.length == _scores.length, "arrays should be of equal length");

        for (uint i = 0; i < _tokenIds.length; i++) {
            updateScore(_tokenIds[i], _scores[i]);
        }
    }

    /**
     * @dev Create Performance Card
     * @param _tokenId card id
     * @param _symbol card symbol
     * @param _name card name
     * @param _score card score
     * @param _cardValue creation value for the card
     * @param _msgHash hash of card parameters
     * @param _signature admin signature
     */
    function createCard(
        uint256 _tokenId,
        string memory _symbol,
        string memory _name,
        uint32 _score,
        uint256 _cardValue,
        bytes32 _msgHash,
        bytes memory _signature,
        /// These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _orderSignature
    )
        public gasPriceLimited
    {
        require(nftRegistry.getBondedERC20(_tokenId) == address(0), "Card already created");

        /// Check hashed message & admin signature
        bytes32 checkHash = keccak256(
            abi.encodePacked(_tokenId, _symbol, _name, _score, _cardValue)
        );

        require(checkHash == _msgHash, "invalid msgHash");
        require(_isValidAdminHash(_msgHash, _signature), "invalid admin signature");

        /// Check the sender has the required TSX balance
        _requireBalance(msg.sender, tsToken, _cardValue);

        /// Calculate the initial ERC20 balance for this card by getting
        ///  a ERC20_INITIAL_POOL_SHARE amount from card creation value
        uint256 cardInitialBalance = (ERC20_INITIAL_POOL_SHARE * _cardValue) / MATH_PRECISION;

        /// Burn the card value minus initial ERC20 balance
        uint256 netTokensToBurn = _cardValue - cardInitialBalance;

        /// Transfer TSX _cardValue from caller account to this contract using EIP712 signature
        EIP712(address(tsToken)).transferWithSig(
            _orderSignature,
            _cardValue,
            keccak256(
                abi.encodePacked(_orderId, address(tsToken), _cardValue)
            ),
            _expiration,
            address(this)
        );

        /// from the cardValue tokens transferred, burn netTokens
        ///  TODO: change this for a call to burn() instead
        tsToken.safeTransfer(owner(), netTokensToBurn);

        /// Swap the initial ERC20 balance in TradeStars tokens for the Stable Reserve
        tsToken.safeIncreaseAllowance(address(tConverter), cardInitialBalance);
        tConverter.trade(
            address(tsToken), address(reserveToken), cardInitialBalance
        );

        /// Create player card (owner is msg.sender) and issue the first tokens to the platform owner
        _createCard(_tokenId, msg.sender, _symbol, _name, _score);

        /// Mint fractionables
        nftRegistry.mintBondedERC20(_tokenId, owner(), ERC20_INITIAL_SUPPLY, cardInitialBalance);
    }

    /**
     * Swap two fractionable ERC721 tokens.
     * @param _tokenId tokenId to liquidate
     * @param _amount wei amount of liquidation in source token.
     * @param _destTokenId tokenId to puurchase.
     */
    function swap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        public gasPriceLimited
    {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exist");
        require(nftRegistry.getBondedERC20(_destTokenId) != address(0), "destTokenId does not exist");

        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(_tokenId, _amount);
        uint256 estimatedTokens = _estimateCardBondedTokens(_destTokenId, reserveAmount);

        /// Burn selled tokens and mint buyed
        nftRegistry.burnBondedERC20(_tokenId, msg.sender, _amount, reserveAmount);
        nftRegistry.mintBondedERC20(_destTokenId, msg.sender, estimatedTokens, reserveAmount);
    }

    /**
     * Estimate Swap between two fractionable ERC721 tokens.
     * @param _tokenId tokenId to liquidate
     * @param _amount wei amount of liquidation in source token.
     * @param _destTokenId tokenId to puurchase.
     */
    function estimateSwap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        public view returns (uint expectedRate, uint slippageRate)
    {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exist");
        require(nftRegistry.getBondedERC20(_destTokenId) != address(0), "destTokenId does not exist");

        /// get reserve amount from selling _amount of tokenId
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _amount
        );

        /// Get amount of _destTokenId tokens
        uint256 estimatedTokens = _estimateCardBondedTokens(
            _destTokenId,
            reserveAmount
        );

        address bondedToken = nftRegistry.getBondedERC20(_tokenId);

        /// Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = estimatedTokens.mul(1e18).div(_amount);
        slippageRate = reserveAmount.mul(1e18).div(
            ERC20Manager.poolBalance(bondedToken)
        );
    }

    /**
     * Purchase of a fractionable ERC721 using TSX
     * @param _tokenId tokenId to purchase
     * @param _paymentAmount wei payment amount in TSX
     */
    function purchase(
        uint256 _tokenId,
        uint256 _paymentAmount,
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _orderSignature
    )
        public gasPriceLimited
    {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exist");

        /// Check the sender has the required TSX balance
        _requireBalance(msg.sender, tsToken, _paymentAmount);

        /// Transfer TSX amount to this contract using EIP712 signature
        EIP712(address(tsToken)).transferWithSig(
            _orderSignature,
            _paymentAmount,
            keccak256(
                abi.encodePacked(_orderId, address(tsToken), _paymentAmount)
            ),
            _expiration,
            address(this)
        );

        /// Convert tokens, get reserve
        tsToken.safeIncreaseAllowance(address(tConverter), _paymentAmount);
        uint256 reserveAmount = tConverter.trade(
            address(tsToken),
            address(reserveToken),
            _paymentAmount
        );

        /// Calculate platform fees.
        uint256 pFee = reserveAmount.mul(GAME_INVESTMENT_FEE).div(MATH_PRECISION);
        uint256 iFee = reserveAmount.mul(OWNER_INVESTMENT_FEE).div(MATH_PRECISION);

        /// Transfer Tx Fees for platform and owner of the NFT.
        reserveToken.safeTransfer(owner(), pFee);
        reserveToken.safeTransfer(
            IERC721Simple(address(nftRegistry)).ownerOf(_tokenId), iFee
        );

        /// Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(pFee + iFee);

        /// The estimated amount of bonded tokens for reserve
        uint256 estimatedTokens = _estimateCardBondedTokens(_tokenId, effectiveReserveAmount);

        /// Issue fractionables to msg sender.
        nftRegistry.mintBondedERC20(_tokenId, msg.sender, estimatedTokens, effectiveReserveAmount);
    }

    /**
     * Estimate Purchase of a fractionable ERC721 using TSX
     * @param _tokenId tokenId to purchase
     * @param _paymentAmount wei payment amount in payment token
     */
    function estimatePurchase(
        uint256 _tokenId,
        uint256 _paymentAmount
    )
        public view returns (uint expectedRate, uint slippageRate)
    {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exist");

        /// Get rate
        uint256 exchangeRate = tConverter.getExpectedRate(
            address(tsToken),
            address(reserveToken),
            _paymentAmount
        );

        /// Divide by CONVERT_PRECISION
        uint256 reserveAmount = _paymentAmount.mul(exchangeRate).div(1e18);

        /// Calc fees
        uint256 fees = reserveAmount
            .mul(GAME_INVESTMENT_FEE + OWNER_INVESTMENT_FEE)
            .div(MATH_PRECISION);

        /// Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(fees);

        /// Get estimated amount of _tokenId for effectiveReserveAmount
        uint256 estimatedTokens = _estimateCardBondedTokens(
            _tokenId,
            effectiveReserveAmount
        );

        address bondedToken = nftRegistry.getBondedERC20(_tokenId);

        /// Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = estimatedTokens.mul(1e18).div(_paymentAmount);
        slippageRate = effectiveReserveAmount.mul(1e18).div(
            ERC20Manager.poolBalance(bondedToken)
        );
    }

    /**
     * Liquidate a fractionable ERC721 for TSX
     * @param _tokenId tokenId to liquidate
     * @param _liquidationAmount wei amount for liquidate
     */
    function liquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount
    )
        public gasPriceLimited
    {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exist");

        /// Estimate reserve for selling _tokenId
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(_tokenId, _liquidationAmount);

        /// Burn selled tokens.
        nftRegistry.burnBondedERC20(_tokenId, msg.sender, _liquidationAmount, reserveAmount);

        /// Trade reserve to TSX and send to liquidator
        reserveToken.safeIncreaseAllowance(address(tConverter), reserveAmount);

        uint256 dstAmount = tConverter.trade(
            address(reserveToken), address(tsToken), reserveAmount
        );

        tsToken.safeTransfer(msg.sender, dstAmount);
    }

    /**
     * Estimate Liquidation of a fractionable ERC721 for TSXH
     * @param _tokenId tokenId to liquidate
     * @param _liquidationAmount wei amount for liquidate
     */
    function estimateLiquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount
    )
        public view returns (uint expectedRate, uint slippageRate)
    {
        require(nftRegistry.getBondedERC20(_tokenId) != address(0), "tokenId does not exist");

        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _liquidationAmount
        );

        /// Get rate
        uint256 exchangeRate = tConverter.getExpectedRate(
            address(reserveToken),
            address(tsToken),
            reserveAmount
        );

        /// Divide by CONVERT_PRECISION
        uint256 estimatedTokens = reserveAmount.mul(exchangeRate).div(1e18);

        address bondedToken = nftRegistry.getBondedERC20(_tokenId);

        /// Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = _liquidationAmount.mul(1e18).div(estimatedTokens);
        slippageRate = reserveAmount.mul(1e18).div(
            ERC20Manager.poolBalance(bondedToken)
        );
    }

    /**
     * @dev Create Performance Card. Internal function.
     * @param _beneficiary - address
     * @param _tokenId - tokenId of new created card
     * @param _symbol - symbol of new created card
     * @param _name - name of new created card
     * @param _score - score of new created card. 0 to 10000
     */
    function _createCard(
        uint256 _tokenId,
        address _beneficiary,
        string memory _symbol,
        string memory _name,
        uint32 _score
    )
        private
    {
        require(_score > 0, "Score should be > 0");
        require(_score <= MATH_PRECISION, "Score should be <= 10000");

        nftRegistry.mintToken(_tokenId, _beneficiary, _symbol, _name);

        // Set metadata info for this token
        cardScoresMap[_tokenId] = _score;
    }

    /**
     * @dev Check if the sender has balance and the contract has enough allowance
     *  to use sender ERC20 on his belhalf
     * @param _sender - address of sender
     * @param _token - ERC20 token registry
     * @param _amount - uint256 of amount of tokens
     */
    function _requireBalance(address _sender, IERC20 _token, uint256 _amount) private view {
        require(_token.balanceOf(_sender) >= _amount, "Insufficient funds");
    }

    /**
     * @dev Estimate an amount of tokens you would get from a wei investment in a given tokenId.
     *  this is private function wont take game fees before calculation.
     * @param _tokenId NFT tokenId
     * @param _value in wei amount.
     */
    function _estimateCardBondedTokens(uint256 _tokenId, uint256 _value) private view returns (uint256) {
        return nftRegistry.estimateBondedERC20Tokens(
            _tokenId,
            _value.mul(MATH_PRECISION - cardScoresMap[_tokenId]).div(MATH_PRECISION)
        );
    }
}