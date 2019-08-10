pragma solidity ^0.5.8;

import "../fractionable/FractionableERC721.sol";
import "../utils/Administrable.sol";
import "../utils/GasPriceLimited.sol";
import "../dex/KyberConverter.sol";

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";
import "openzeppelin-eth/contracts/token/ERC20/ERC20Burnable.sol";
import "openzeppelin-eth/contracts/token/ERC20/SafeERC20.sol";


contract PerformanceCard is FractionableERC721, Administrable, KyberConverter, GasPriceLimited {

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

    /// Reserve Token. (DAI)
    IERC20 private reserveToken;

    /// Mapping for player scores
    mapping(uint256 => uint32) private cardScoresMap;

    /**
     * @dev Initializer for PerformanceCard contract
     * @param _sender - address owner of the contract
     * @param _tsToken - TS token registry address
     * @param _reserveToken - Reserve registry address
     * @param _kyberProxy - Kyber proxy address
     * @param _bondedHelper - Bonded helper contract address
     */
     function initialize(
        address _sender,
        address _tsToken,
        address _reserveToken,
        address _kyberProxy,
        address _bondedHelper
    )
        public initializer
    {
        Administrable.initialize(_sender);
        KyberConverter.initialize(_kyberProxy, _sender);

        FractionableERC721.initialize(
            "TradeStars Performance Cards' Registry",
            "TSCARD",
            "https://api.tradestars.app/cards/",
            _bondedHelper
        );

        /// Set TS and Reseve Token addresses
        tsToken = IERC20(_tsToken);
        reserveToken = IERC20(_reserveToken);
    }

    /**
     * @dev Set registry base token URI
     * @param _uri string of the base uri in the form: 'schema://domain/path'
     */
    function setBaseTokenUri(string calldata _uri) external onlyAdmin {
        _setBaseTokenUri(_uri);
    }

    /**
     * @dev Bulk update scores for tokenIds
     * @param _tokenId tokenId to query for
     */
    function getScore(uint256 _tokenId) external view returns (uint256) {
        require(_exists(_tokenId), "tokenId does not exists");
        return cardScoresMap[_tokenId];
    }

    /**
     * @dev Updates Score of given tokenId.
     * @param _tokenId tokenId to update
     * @param _score scores
     */
    function updateScore(uint256 _tokenId, uint32 _score) public onlyAdmin {
        require(_exists(_tokenId), "tokenId not created");
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
        string calldata _symbol,
        string calldata _name,
        uint32 _score,
        uint256 _cardValue,
        bytes32 _msgHash,
        bytes calldata _signature
    )
        external gasPriceLimited
    {
        require(!_exists(_tokenId), "Card already created");

        /// Check hashed message & admin signature
        bytes32 checkHash = keccak256(
            abi.encodePacked(_tokenId, _symbol, _name, _score, _cardValue)
        );

        require(checkHash == _msgHash, "invalid msgHash");
        require(_isValidAdminHash(_msgHash, _signature), "invalid admin signature");

        /// Check the sender has the required TS balance
        _requireBalance(msg.sender, tsToken, _cardValue);

        /// Calculate the initial ERC20 balance for this card by getting
        ///  a ERC20_INITIAL_POOL_SHARE amount from card creation value
        uint256 cardInitialBalance = (ERC20_INITIAL_POOL_SHARE * _cardValue) / MATH_PRECISION;

        /// Burn the card value minus initial ERC20 balance
        uint256 netTokensToBurn = _cardValue - cardInitialBalance;

        ERC20Burnable(address(tsToken)).burnFrom(
            msg.sender,
            netTokensToBurn
        );

        /// Swap the initial ERC20 balance in TradeStars tokens for the Stable Reserve
        // _swapTokens(
        //     tsToken,
        //     reserveToken,
        //     cardInitialBalance,
        //     0, /// all source tokens converted
        //     0, /// lowest convertion rate available
        //     address(this) /// hold reserve tokens here.
        // );

        /// TODO: REPLACE FOR KYBER
        tsToken.safeTransferFrom(msg.sender, address(this), cardInitialBalance);

        /// Create player card and issue the first tokens to the platform owner
        _createCard(_tokenId, msg.sender, _symbol, _name, _score);
        _mintBondedERC20(_tokenId, owner(), ERC20_INITIAL_SUPPLY, cardInitialBalance);
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
        external gasPriceLimited
    {
        require(_exists(_tokenId), "tokenId does not exist");
        require(_exists(_destTokenId), "destTokenId does not exist");

        uint256 reserveAmount = _estimateBondedERC20Value(_tokenId, _amount);
        uint256 estimatedTokens = _estimateCardBondedTokens(_destTokenId, reserveAmount);

        /// Burn selled tokens.
        _burnBondedERC20(_tokenId, msg.sender, _amount, reserveAmount);
        _mintBondedERC20(_destTokenId, msg.sender, estimatedTokens, reserveAmount);
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
        external view returns (uint expectedRate, uint slippageRate)
    {
        require(_exists(_tokenId), "tokenId does not exist");
        require(_exists(_destTokenId), "destTokenId does not exist");

        /// get reserve amount from selling _amount of tokenId
        uint256 reserveAmount = _estimateBondedERC20Value(
            _tokenId,
            _amount
        );

        /// Get amount of _destTokenId tokens
        uint256 estimatedTokens = _estimateCardBondedTokens(
            _destTokenId,
            reserveAmount
        );

        BondedERC20 bondedToken = getBondedERC20(_tokenId);

        /// Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = estimatedTokens.mul(1e18).div(_amount);
        slippageRate = reserveAmount.mul(1e18).div(
            bondedToken.poolBalance()
        );
    }


    /**
     * Purchase of a fractionable ERC721 using TSX or ETH
     * @param _tokenId tokenId to purchase
     * @param _paymentToken address for TSX or ETH
     * @param _paymentAmount wei payment amount in payment token
     */
    function purchase(
        uint256 _tokenId,
        address _paymentToken,
        uint256 _paymentAmount
    )
        external payable gasPriceLimited
    {
        require(_exists(_tokenId), "tokenId does not exist");
        require(
            _paymentToken == address(tsToken) || // TSX Token
            _paymentToken == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE), // Ether
            'payment not supported'
        );

        if (_paymentToken == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE)) {
            require(msg.value == _paymentAmount, "invalid msg.value");

        } else {
            _requireBalance(msg.sender, IERC20(_paymentToken), _paymentAmount);

            /// Transfer src payment token to this contract.
            IERC20(_paymentToken).safeTransferFrom(
                msg.sender,
                address(this),
                _paymentAmount
            );
        }

        ///////////////////////////////////////////////////

        uint256 reserveAmount = _paymentAmount / 2; /// TEMPORARY Kyber bypass

        /// Swap TSX or ETH to reserve
        // uint256 reserveAmount = _swapTokens(
        //     _paymentToken,
        //     reserveToken,
        //     _paymentAmount,
        //     0, /// all source tokens converted
        //     0, /// lowest convertion rate available
        //     address(this) /// hold reserve tokens here.
        // );

        ///////////////////////////////////////////////////

        /// Calculate platform fees.
        uint256 pFee = reserveAmount.mul(GAME_INVESTMENT_FEE).div(MATH_PRECISION);
        uint256 iFee = reserveAmount.mul(OWNER_INVESTMENT_FEE).div(MATH_PRECISION);

        /// If payment is not TSX, charge 2x fees.
        if (_paymentToken != address(tsToken)) {
            pFee = pFee * 2;
            iFee = iFee * 2;
        }

        /// Transfer Tx Fees.
        reserveToken.safeTransfer(owner(), pFee);
        reserveToken.safeTransfer(ownerOf(_tokenId), iFee);

        /// Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(pFee + iFee);

        /// The estimated amount of bonded tokens for reserve
        uint256 estimatedTokens = _estimateCardBondedTokens(_tokenId, effectiveReserveAmount);

        /// Issue tokens to msg sender.
        _mintBondedERC20(_tokenId, msg.sender, estimatedTokens, effectiveReserveAmount);
    }


    /**
     * Estimate Purchase of a fractionable ERC721 using TSX or ETH
     * @param _tokenId tokenId to purchase
     * @param _paymentToken address for TSX or ETH
     * @param _paymentAmount wei payment amount in payment token
     */
    function estimatePurchase(
        uint256 _tokenId,
        address _paymentToken,
        uint256 _paymentAmount
    )
        external view returns (uint expectedRate, uint slippageRate)
    {
        require(_exists(_tokenId), "tokenId does not exist");
        require(
            _paymentToken == address(tsToken) || // TSX Token
            _paymentToken == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE), // Ether
            'payment not supported'
        );

        ///////////////////////////////////////////////////
        uint256 kyberExchangeRate = 1 ether; /// TEMPORARY Kyber bypass

        /// Use kyber to estimmate conversion from ETH or TSX to reserve.
        // uint256 (kyberExchangeRate, kyberSlippage) = _getExpectedRate(
        //     _paymentToken, reserveToken, _paymentAmount
        // );
        ///////////////////////////////////////////////////

        uint256 reserveAmount = _paymentAmount.mul(kyberExchangeRate).div(1e18);

        /// If payment is not TS, charge 2x tx fees.
        uint256 fees = reserveAmount
            .mul(GAME_INVESTMENT_FEE + OWNER_INVESTMENT_FEE)
            .div(MATH_PRECISION);

        if (_paymentToken != address(tsToken)) {
            fees = fees * 2;
        }

        /// Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(fees);

        /// Get estimated amount of _tokenId for effectiveReserveAmount
        uint256 estimatedTokens = _estimateCardBondedTokens(
            _tokenId,
            effectiveReserveAmount
        );

        BondedERC20 bondedToken = getBondedERC20(_tokenId);

        /// Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = estimatedTokens.mul(1e18).div(_paymentAmount);
        slippageRate = effectiveReserveAmount.mul(1e18).div(
            bondedToken.poolBalance()
        );
    }


    /**
     * Liquidate a fractionable ERC721 for TSX or ETH
     * @param _tokenId tokenId to liquidate
     * @param _liquidationAmount wei amount for liquidate
     * @param _paymentToken address for TSX or ETH
     */
    function liquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount,
        address _paymentToken
    )
        external gasPriceLimited
    {
        require(_exists(_tokenId), "tokenId does not exist");
        require(
            _paymentToken == address(tsToken) || // TSX Token
            _paymentToken == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE), // Ether
            'payment not supported'
        );

        /// Estimate reserve for selling _tokenId
        uint256 reserveAmount = _estimateBondedERC20Value(_tokenId, _liquidationAmount);
        uint256 pFee = 0;

        /// Burn selled tokens.
        _burnBondedERC20(_tokenId, msg.sender, _liquidationAmount, reserveAmount);

        /// If payment is not TSX, charge game fee.
        if (_paymentToken != address(tsToken)) {
            pFee = reserveAmount.mul(GAME_INVESTMENT_FEE).div(MATH_PRECISION);
            reserveToken.safeTransfer(owner(), pFee);
        }

        ///////////////////////////////////////////////////

        /// Reserve to TSX or ETH and send to liquidator
        // _swapTokens(
        //     reserveToken,
        //     _paymentToken,
        //     reserveAmount - pFee,
        //     0,
        //     0, /// lowest convertion rate available
        //     msg.sender
        // );
    }


    /**
     * Estimate Liquidation of a fractionable ERC721 for TSX or ETH
     * @param _tokenId tokenId to liquidate
     * @param _liquidationAmount wei amount for liquidate
     * @param _paymentToken address for TSX or ETH
     */
    function estimateLiquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount,
        address _paymentToken
    )
        external view returns (uint expectedRate, uint slippageRate)
    {
        require(_exists(_tokenId), "tokenId does not exist");
        require(
            _paymentToken == address(tsToken) || // TSX Token
            _paymentToken == address(0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE), // Ether
            'payment not supported'
        );

        uint256 reserveAmount = _estimateBondedERC20Value(_tokenId, _liquidationAmount);

        ///////////////////////////////////////////////////
        uint256 kyberExchangeRate = 2 ether; /// TEMPORARY Kyber bypass

        /// Use kyber to estimmate conversion from reserve to ETH or TSX.
        // uint256 (kyberExchangeRate, kyberSlippage) = _getExpectedRate(
        //     reserveToken, _paymentToken, reserveAmount
        // );

        ///////////////////////////////////////////////////

        uint256 estimatedTokens = reserveAmount.mul(kyberExchangeRate).div(1e18);
        BondedERC20 bondedToken = getBondedERC20(_tokenId);

        /// Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = _liquidationAmount.mul(1e18).div(estimatedTokens);
        slippageRate = reserveAmount.mul(1e18).div(
            bondedToken.poolBalance()
        );
    }

    /**
     * @dev Create Performance Card. Internal function.
     * @param _beneficiary - address
     * @param _tokenId - tokenId of new created card
     * @param _symbol - symbol of new created card
     * @param _name - name of new created card
     * @param _score - score of new created card
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

        _mintToken(_tokenId, _beneficiary, _symbol, _name);

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
        require(_token.allowance(_sender, address(this)) >= _amount, "Insufficient allowance");
    }

    /**
     * @dev Estimate an amount of tokens you would get from a wei investment in a given tokenId.
     *  this is private function wont take game fees before calculation.
     * @param _tokenId NFT tokenId
     * @param _value in wei amount.
     */
    function _estimateCardBondedTokens(uint256 _tokenId, uint256 _value) private view returns (uint256) {
        return _estimateBondedERC20Tokens(
            _tokenId,
            _value.mul(MATH_PRECISION - cardScoresMap[_tokenId]).div(MATH_PRECISION)
        );
    }
}