pragma solidity ^0.5.0;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";

import "../utils/Administrable.sol";
import "../utils/GasPriceLimited.sol";

import "../dex/KyberConverter.sol";
import "../fractionable/FractionableERC721.sol";

contract PerformanceCard is Administrable, FractionableERC721, KyberConverter, GasPriceLimited {

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
     * @dev Create Performance Card
     * @param _tokenId card id
     * @param _symbol card symbol
     * @param _name card name
     * @param _score card score
     * @param _msgHash hash of card parameters
     * @param _signature admin signature
     * @param _cardValue creation value for the card
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
        uint256 cardInitialBalance = _cardValue
            .mul(ERC20_INITIAL_POOL_SHARE)
            .div(MATH_PRECISION);

        /// Swap the initial ERC20 balance in TradeStars tokens for the Stable Reserve
        _swapTokens(
            tsToken,
            reserveToken,
            cardInitialBalance,
            0, /// all source tokens converted
            0, /// lowest convertion rate available
            address(this) /// hold reserve tokens here.
        );

        /// Burn the card value minus initial ERC20 balance
        uint256 netTokensToBurn = _cardValue.sub(cardInitialBalance);

        require(
            tsToken.transferFrom(msg.sender, address(0), netTokensToBurn),
            "Can't burn TS from msg.sender"
        );

        //// Create player card and issue the first tokens to the platform owner
        _createCard(_tokenId, msg.sender, _symbol, _name, _score);
        _mintBondedERC20(_tokenId, owner(), ERC20_INITIAL_SUPPLY, cardInitialBalance);
    }

    /**
     * @dev Buy shares sending eth to the contract
     * @param _tokenId NFT tokenId
     */
    function buyShares(uint256 _tokenId, uint256 _value) external gasPriceLimited {
        require(_exists(_tokenId), "tokenId not created");
        require(_value > 0, "value should be > 0");

        /// Check the sender has the required balance
        _requireBalance(msg.sender, tsToken, _value);

        /// Investment & Platform fees.
        uint256 pFee = _value.mul(GAME_INVESTMENT_FEE).div(MATH_PRECISION);
        uint256 iFee = _value.mul(OWNER_INVESTMENT_FEE).div(MATH_PRECISION);

        /// Transfer Tx Fees.
        require(
            tsToken.transferFrom(msg.sender, owner(), pFee),
            "Can't transfer buy tx platform fee to contract owner"
        );

        require(
            tsToken.transferFrom(msg.sender, ownerOf(_tokenId), iFee),
            "Can't transfer buy tx investment fee to card owner"
        );

        /// The final _value after tx fees.
        uint256 netValue = _value.sub(pFee + iFee);

        /// Swap TradeStars tokens for the Stable Reserve
        _swapTokens(
            tsToken,
            reserveToken,
            netValue,
            0, /// all source tokens converted
            0, /// lowest convertion rate available
            address(this) /// hold reserve tokens here.
        );

        /// The estimated amount of bonded tokens for provided value
        uint256 amount = _estimatePlayerTokens(_tokenId, netValue);

        /// Mint tokens for this investor
        _mintBondedERC20(_tokenId, msg.sender, amount, netValue);
    }

    /**
     * @dev Sell shares owned by the msg sender. Get reserve tokens in return
     * @param _tokenId NFT tokenId
     * @param _amount Sell amount
     */
    function sellShares(uint256 _tokenId, uint256 _amount) external gasPriceLimited {
        require(_exists(_tokenId), "tokenId not created");
        require(_amount > 0, "amout should be > 0");

        /// Calculate return based on current tokens price.
        uint256 value = _estimateBondedERC20Value(_tokenId, _amount);
        address burner = msg.sender;

        /// Burn selled tokens.
        _burnBondedERC20(_tokenId, burner, _amount, value);

        /// Swap reserve and send ts to seller
        _swapTokens(
            reserveToken,
            tsToken,
            value,
            0, /// all reserve tokens converted
            0, /// lowest convertion rate available
            burner /// send TS to burner
        );
    }

    /**
     * @dev Estimate value you would get from selling the provided amount of tokens.
     * @param _tokenId NFT tokenId
     * @param _amount wei amount.
     */
    function estimateValue(uint256 _tokenId, uint256 _amount) external view returns (uint256) {
        require(_exists(_tokenId), "tokenId does not exist");
        return _estimateBondedERC20Value(_tokenId, _amount);
    }

    /**
     * @dev Estimate an amount of tokens you would get from a wei investment in a given tokenId.
     *  this is public function and takes the game fees before calculation.
     * @param _tokenId NFT tokenId
     * @param _value tokens value in wei.
     */
    function estimateTokens(uint256 _tokenId, uint256 _value) external view returns (uint256) {
        require(_exists(_tokenId), "tokenId does not exist");

        // Get value net of games fees.
        uint256 fees = _value
            .mul(GAME_INVESTMENT_FEE + OWNER_INVESTMENT_FEE)
            .div(MATH_PRECISION);

        return _estimatePlayerTokens(_tokenId, _value.sub(fees));
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
     * @dev Initializer for PerformanceCard contract
     * @param _sender - address owner of the contract
     * @param _tsToken - ERC20 address of TS token
     * @param _kyberProxy - Kyber proxy address
     * @param _bondedHelper - Bonded helper contract
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
            "TradeStars Performance Card Registry",
            "TSCARD",
            "https://api.tradestars.app/cards/",
            _bondedHelper
        );

        /// Set TS and Reseve Token addresses
        tsToken = IERC20(_tsToken);
        reserveToken = IERC20(_reserveToken);
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
        internal
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
    function _requireBalance(address _sender, IERC20 _token, uint256 _amount) internal view {
        require(_token.balanceOf(_sender) >= _amount, "Insufficient funds");
        require(_token.allowance(_sender, address(this)) >= _amount, "Insufficient allowance");
    }

    /**
     * @dev Estimate an amount of tokens you would get from a wei investment in a given tokenId.
     *  this is private function wont take game fees before calculation.
     * @param _tokenId NFT tokenId
     * @param _value in wei amount.
     */
    function _estimatePlayerTokens(uint256 _tokenId, uint256 _value) private view returns (uint256) {
        return _estimateBondedERC20Tokens(
            _tokenId,
            _value.mul(MATH_PRECISION - cardScoresMap[_tokenId]).div(MATH_PRECISION)
        );
    }
}