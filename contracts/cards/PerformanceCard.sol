pragma solidity ^0.6.8;

import "./ICard.sol";

import "../lib/Strings.sol";
import "../lib/ERC20Manager.sol";

import "../utils/Administrable.sol";
import "../utils/GasPriceLimited.sol";

import "../fractionable/IFractionableERC721.sol";

import "@openzeppelin/contracts-ethereum-package/contracts/cryptography/ECDSA.sol";

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

    using ECDSA for bytes32;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    /// .0001 precision.
    uint32 public constant MATH_PRECISION = 1e4;

    /// Constant values for creating bonded ERC20 tokens.
    uint256 public constant ERC20_INITIAL_SUPPLY = 100000e18; // 100000 units
    uint256 public constant ERC20_INITIAL_POOL_SHARE = 250; // 2.5%
    uint256 public constant PLATFORM_CUT = 250; // 2.5%

    /// Reserve Token.
    IERC20 private reserveToken;

    /// Converter
    IFractionableERC721 private nftRegistry;

    /// Base card URI metadata.
    string public baseUrlPath;

    /// Relayed signatures map
    mapping(bytes => bool) private relayedSignatures;

    /**
     * @dev Initializer for PerformanceCard contract
     * @param _nftRegistry - NFT Registry address
     * @param _reserveToken - Reserve registry address
     */
     function initialize(
        address _owner,
        address _nftRegistry,
        address _reserveToken
    )
        public initializer
    {
        Administrable.initialize(_owner);

        /// Set Reseve Token addresses
        reserveToken = IERC20(_reserveToken);

        /// Set the NFT Registry
        nftRegistry = IFractionableERC721(_nftRegistry);
    }

    /**
     * @dev Executes a transaction that was relayed by a 3rd party
     * @param _nonce tx nonce
     * @param _signer signer who's the original beneficiary
     * @param _abiEncoded function signature
     * @param _orderHashSignature keccak256(nonce, signer, function)
     */
    function executeRelayedTx(
        uint256 _nonce,
        address _signer,
        bytes calldata _abiEncoded,
        bytes calldata _orderHashSignature
    )
        external returns (bytes memory)
    {
        require(
            relayedSignatures[_orderHashSignature] == false,
            "PerformanceCard: Invalid _orderSignature"
        );

        /// Check hashed message & signature
        bytes32 _hash = keccak256(
            abi.encodePacked(_nonce, _signer, _abiEncoded)
        );

        require(
            _signer == _hash.toEthSignedMessageHash().recover(_orderHashSignature),
            "PerformanceCard: invalid signature verification"
        );

        relayedSignatures[_orderHashSignature] = true;

        // Append signer address at the end to extract it from calling context
        (bool success, bytes memory returnData) = address(this).call(
            abi.encodePacked(
                _abiEncoded, _signer
            )
        );
        require(success, "PerformanceCard: Function call error");

        return returnData;
    }

    /**
     * @dev Create Performance Card
     * @param _tokenId card id
     * @param _symbol card symbol
     * @param _name card name
     * @param _cardValue creation value for the card
     * @param _msgHash hash of card parameters
     * @param _signature admin signature
     */
    function createCard(
        uint256 _tokenId,
        string memory _symbol,
        string memory _name,
        uint256 _reserveAmount,
        bytes32 _msgHash,
        bytes memory _signature,
        /// These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _orderSignature
    )
        public gasPriceLimited
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) == address(0),
            "PerformanceCard: card already created"
        );

        /// Check hashed message & admin signature
        bytes32 checkHash = keccak256(
            abi.encodePacked(_tokenId, _symbol, _name, _score, _reserveAmount)
        );

        require(
            checkHash == _msgHash,
            "PerformanceCard: invalid msgHash"
        );

        require(
            _isValidAdminHash(_msgHash, _signature),
            "PerformanceCard: invalid admin signature"
        );

        /// Check the sender has the required sTSX balance
        _requireBalance(msgSender(), reserveToken, _reserveAmount);

        /// Transfer sTSX _reserveAmount from caller account to this contract using EIP712 signature
        EIP712(address(_reserveToken)).transferWithSig(
            _orderSignature,
            _reserveAmount,
            keccak256(
                abi.encodePacked(_orderId, address(reserveToken), _reserveAmount)
            ),
            _expiration,
            address(this)
        );

        /// Create NFT
        /// - The NFT owner is platform owner
        /// - The ERC20_INITIAL_SUPPLY is for msgSender()
        ///
        nftRegistry.mintToken(_tokenId, owner(), _symbol, _name);
        nftRegistry.mintBondedERC20(_tokenId, msgSender(), ERC20_INITIAL_SUPPLY, reserveAmount);
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
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        require(
            nftRegistry.getBondedERC20(_destTokenId) != address(0),
            "PerformanceCard: destTokenId does not exist"
        );

        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _amount
        );

        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _destTokenId,
            reserveAmount
        );

        /// Burn selled tokens and mint buyed
        nftRegistry.burnBondedERC20(_tokenId, msgSender(), _amount, reserveAmount);
        nftRegistry.mintBondedERC20(_destTokenId, msgSender(), estimatedTokens, reserveAmount);
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
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        require(
            nftRegistry.getBondedERC20(_destTokenId) != address(0),
            "PerformanceCard: destTokenId does not exist"
        );

        /// get reserve amount from selling _amount of tokenId
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _amount
        );

        /// Get amount of _destTokenId tokens
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
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
     * Purchase of a fractionable ERC721 using sTSX
     * @param _tokenId tokenId to purchase
     * @param _paymentAmount wei payment amount in sTSX
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
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        /// Check the sender has the required sTSX balance
        _requireBalance(msgSender(), reserveToken, _paymentAmount);

        /// Transfer sTSX amount to this contract using EIP712 signature
        EIP712(address(reserveToken)).transferWithSig(
            _orderSignature,
            _paymentAmount,
            keccak256(
                abi.encodePacked(_orderId, address(reserveToken), _paymentAmount)
            ),
            _expiration,
            address(this)
        );

        /// transfer platform cut.
        uint256 pFee = reserveAmount.mul(PLATFORM_CUT).div(MATH_PRECISION);
        reserveToken.safeTransfer(owner(), pFee);

        /// Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(pFee);

        /// The estimated amount of bonded tokens for reserve
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _tokenId,
            effectiveReserveAmount
        );

        /// Issue fractionables to msg sender.
        nftRegistry.mintBondedERC20(
            _tokenId,
            msgSender(),
            estimatedTokens,
            effectiveReserveAmount
        );
    }

    /**
     * Estimate Purchase of a fractionable ERC721 using sTSX
     * @param _tokenId tokenId to purchase
     * @param _paymentAmount wei payment amount in payment token
     */
    function estimatePurchase(
        uint256 _tokenId,
        uint256 _paymentAmount
    )
        public view returns (uint expectedRate, uint slippageRate)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        /// Get rate
        uint256 exchangeRate = tConverter.getExpectedRate(
            address(reserveToken),
            address(reserveToken),
            _paymentAmount
        );

        /// Divide by CONVERT_PRECISION
        uint256 reserveAmount = _paymentAmount.mul(exchangeRate).div(1e18);

        /// Calc fees
        uint256 pFees = reserveAmount.mul(PLATFORM_CUT).div(MATH_PRECISION);

        /// Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(pFees);

        /// Get estimated amount of _tokenId for effectiveReserveAmount
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
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
     * Liquidate a fractionable ERC721 for sTSX
     * @param _tokenId tokenId to liquidate
     * @param _liquidationAmount wei amount for liquidate
     */
    function liquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount
    )
        public gasPriceLimited
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        /// Estimate reserve for selling _tokenId
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _liquidationAmount
        );

        /// Burn selled tokens.
        nftRegistry.burnBondedERC20(
            _tokenId,
            msgSender(),
            _liquidationAmount,
            reserveAmount
        );

        /// Trade reserve to sTSX and send to liquidator
        reserveToken.safeTransfer(msgSender(), reserveAmount);
    }

    /**
     * Estimate Liquidation of a fractionable ERC721 for sTSX
     * @param _tokenId tokenId to liquidate
     * @param _liquidationAmount wei amount for liquidate
     */
    function estimateLiquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount
    )
        public view returns (uint expectedRate, uint slippageRate)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _liquidationAmount
        );

        /// Get rate
        uint256 exchangeRate = tConverter.getExpectedRate(
            address(reserveToken),
            address(reserveToken),
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
     * @dev Check if the sender has balance and
     *  to use sender ERC20 on his belhalf
     * @param _sender - address of sender
     * @param _token - ERC20 token registry
     * @param _amount - uint256 of amount of tokens
     */
    function _requireBalance(address _sender, IERC20 _token, uint256 _amount) private view {
        require(
            _token.balanceOf(_sender) >= _amount,
            "PerformanceCard: insufficient balance"
        );
    }

    /**
     * @dev Returns message sender. If its called from a relayed call it gets
     *  the sender address from last 20 bytes msg.data
     */
    function msgSender() private view returns (address payable result) {
        if (msg.sender == address(this)) {

            bytes memory array = msg.data;
            uint256 index = msg.data.length;

            // Load the 32 bytes word from memory with the address on the lower 20 bytes, and mask those.
            assembly {
                result := and(mload(add(array, index)), 0xffffffffffffffffffffffffffffffffffffffff)
            }
            return result;
        }
        return msg.sender;
    }
}
