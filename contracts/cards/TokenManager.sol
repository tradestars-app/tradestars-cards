// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ITokenManager.sol";
import "./IUnlockRegistry.sol";

import "../lib/ERC20Manager.sol";
import "../fractionable/IFractionableERC721.sol";

import "../eip712/ITransferWithSig.sol";
import "../commons/MetaTransactionsMixin.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/ERC20Burnable.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


// Main Contract

contract TokenManager is Ownable, ITokenManager, MetaTransactionsMixin {

    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // .0001 precision.
    uint32 public constant MATH_PRECISION = 1e4;

    // Constant values for creating bonded ERC20 tokens.
    uint256 public constant ERC20_INITIAL_SUPPLY = 10000e18; // 10000 units
    uint256 public constant PLATFORM_CUT = 50; // .5%

    // Reserve Token.
    IERC20 private immutable reserveToken;

    // NFT Registry
    IFractionableERC721 private immutable nftRegistry;

    // Unlock Registry
    IUnlockRegistry private immutable unlockRegistry;

    // Admin address allowed 
    address private validAdminAddress;

    /**
     * @dev Initializer for TokenManager contract
     * @param _nftRegistry - NFT Registry address
     * @param _reserveToken - Reserve registry address (1e18 decimals)
     * @param _unlockRegistry - Unlock registry address
     */
     constructor(
         address _nftRegistry, 
         address _reserveToken,
         address _unlockRegistry
    ) Ownable() {

        // Set Reseve Token addresses
        reserveToken = IERC20(_reserveToken);

        // Set the NFT Registry
        nftRegistry = IFractionableERC721(_nftRegistry);

        // set the UnlockRegistry
        unlockRegistry = IUnlockRegistry(_unlockRegistry);
    }

    /**
     * @dev Migrate vault in case we want to upgrade the logic
     *  can only be called by the owner of the contract
     * @param _newTokenManager - new tokenManager contract
     */
    function migrateReserve(address _newTokenManager) external onlyOwner {
        reserveToken.safeTransfer(
            _newTokenManager, 
            reserveToken.balanceOf(address(this))
        );
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function setAdminAddress(address _newAdmin) external onlyOwner {
        validAdminAddress = _newAdmin;
    }

    /**
     * @dev Create Card
     * @param _tokenId card id
     * @param _symbol card symbol
     * @param _name card name
     * @param _minLiquidityAmount creation value for the card
     * @param _orderAmount contribution to creation value for the card
     * @param _orderAdminSignature admin signature for createCard order
     * @param _expiration for EIP712 order call
     * @param _orderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function createCard(
        uint256 _tokenId,
        string memory _symbol,
        string memory _name,
        uint256 _minLiquidityAmount,
        uint256 _orderAmount,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    )
        public
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) == address(0),
            "createCard() - card already created"
        );

        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                _tokenId, 
                _symbol, 
                _name, 
                _minLiquidityAmount, 
                block.chainid, 
                address(this)
            )
        );

        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "createCard() - invalid admin signature"
        );

        // Transfer TSX _orderAmount from sender using EIP712 signature
        ITransferWithSig(address(reserveToken)).transferWithSig(
            _eip712TransferSignature,
            _orderAmount,
            keccak256(
                abi.encodePacked(_orderId, address(reserveToken), _orderAmount)
            ),
            _expiration,
            msgSender(),   // from
            address(this)   // to
        );

        // add user liquidity contribution.
        (uint256 refund, bool contributionCompleted) = unlockRegistry.addContribution(
            _tokenId, 
            msgSender(), 
            _orderAmount,
            _minLiquidityAmount
        );

        if (refund > 0) {
            reserveToken.transfer(msgSender(), refund);
        }

        if (contributionCompleted) {
            _createCard(_tokenId, _symbol, _name, _minLiquidityAmount);
        }
    }

    /**
     * Swap two fractionable ERC721 tokens.
     * @param _tokenId tokenId to liquidate
     * @param _amount wei amount of liquidation in source token.
     * @param _destTokenId tokenId to purchase.
     * @param _minDstTokenAmount slippage protection
     */
    function swap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId,
        uint256 _minDstTokenAmount
    )
        public override
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "swap() - tokenId does not exist"
        );

        require(
            nftRegistry.getBondedERC20(_destTokenId) != address(0),
            "swap() - destTokenId does not exist"
        );

        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _amount
        );

        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _destTokenId,
            reserveAmount
        );

        require(
            estimatedTokens >= _minDstTokenAmount, 
            "swap() - dst amount < minimum requested"
        );

        // Burn src tokens and mint dst token. Does not takes tx fees
        nftRegistry.burnBondedERC20(_tokenId, msgSender(), _amount, reserveAmount);
        nftRegistry.mintBondedERC20(_destTokenId, msgSender(), estimatedTokens, reserveAmount);
    }

    /**
     * Estimate Swap between two fractionable ERC721 tokens.
     * @param _tokenId tokenId to liquidate
     * @param _amount wei amount of liquidation in source token.
     * @param _destTokenId tokenId to purchase.
     */
    function estimateSwap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        public view override returns (uint expectedRate, uint reserveImpact)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "estimateSwap() - tokenId does not exist"
        );

        require(
            nftRegistry.getBondedERC20(_destTokenId) != address(0),
            "estimateSwap() - destTokenId does not exist"
        );

        // get reserve amount from selling _amount of tokenId
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _amount
        );

        // Get amount of _destTokenId tokens
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _destTokenId,
            reserveAmount
        );

        address bondedToken = nftRegistry.getBondedERC20(_destTokenId);

        // Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = (estimatedTokens * 1e18) / _amount;
        reserveImpact = (reserveAmount * 1e18) / ERC20Manager.poolBalance(bondedToken);
    }

    /**
     * Purchase of a fractionable ERC721 using reserve token
     * @param _tokenId tokenId to purchase
     * @param _paymentAmount wei payment amount in reserve token
     * @param _minDstTokenAmount slippage protection
     * @param _expiration for EIP712 order call
     * @param _orderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function purchase(
        uint256 _tokenId,
        uint256 _paymentAmount,
        uint256 _minDstTokenAmount,
        // EIP712 sigTransfer
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    )
        public override
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "purchase() - tokenId does not exist"
        );

        // Transfer TSX _paymentAmount from sender using EIP712 signature
        ITransferWithSig(address(reserveToken)).transferWithSig(
            _eip712TransferSignature,
            _paymentAmount,
            keccak256(
                abi.encodePacked(_orderId, address(reserveToken), _paymentAmount)
            ),
            _expiration,
            msgSender(),   // from
            address(this)   // to
        );

        // Calc fees
        uint256 pFees = (_paymentAmount * PLATFORM_CUT) / MATH_PRECISION;

        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = _paymentAmount - pFees;

        // Burn reserve Tx Fees
        ERC20Burnable(address(reserveToken)).burn(pFees);
        
        // The estimated amount of bonded tokens for reserve
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _tokenId,
            effectiveReserveAmount
        );
    
        require(
            estimatedTokens >= _minDstTokenAmount, 
            "purchase() - dst amount < minimum requested"
        );

        // Issue fractionables to msg sender.
        nftRegistry.mintBondedERC20(
            _tokenId,
            msgSender(),
            estimatedTokens,
            effectiveReserveAmount
        );
    }

    /**
     * Estimate Purchase of a fractionable ERC721 using reserve tokens
     * @param _tokenId tokenId to purchase
     * @param _paymentAmount wei payment amount in reserve token
     */
    function estimatePurchase(
        uint256 _tokenId,
        uint256 _paymentAmount
    )
        public view override returns (uint expectedRate, uint reserveImpact)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "estimatePurchase() - tokenId does not exist"
        );

        // Calc fees
        uint256 pFees = (_paymentAmount * PLATFORM_CUT) / MATH_PRECISION;

        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = _paymentAmount - pFees;

        // Get estimated amount of _tokenId for effectiveReserveAmount
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _tokenId,
            effectiveReserveAmount
        );

        address bondedToken = nftRegistry.getBondedERC20(_tokenId);

        // Return the expected exchange rate and impact on reserve
        expectedRate = (estimatedTokens * 1e18) / _paymentAmount;
        reserveImpact = (effectiveReserveAmount * 1e18) / ERC20Manager.poolBalance(bondedToken);
    }

    /**
     * Liquidate a fractionable ERC721 for reserve token
     * @param _tokenId tokenId to liquidate
     * @param _liquidationAmount wei amount for liquidate
     * @param _minDstTokenAmount slippage protection
     */
    function liquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount,
        uint256 _minDstTokenAmount
    )
        public override
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "liquidate() - tokenId does not exist"
        );

        // Estimate reserve for selling _tokenId
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _liquidationAmount
        );

        require(
            reserveAmount >= _minDstTokenAmount, 
            "liquidate() - dst amount < minimum requested"
        );

        // Burn selled tokens.
        nftRegistry.burnBondedERC20(
            _tokenId,
            msgSender(),
            _liquidationAmount,
            reserveAmount
        );

        // fees
        uint256 pFee = (reserveAmount * PLATFORM_CUT) / MATH_PRECISION;
        
        // Burn reserve Tx Fees
        ERC20Burnable(address(reserveToken)).burn(pFee);
        
        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount - pFee;

        // Trade reserve to sTSX and send to liquidator
        reserveToken.safeTransfer(
            msgSender(), 
            effectiveReserveAmount
        );
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
        public view override returns (uint expectedRate, uint reserveImpact)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "estimateLiquidate() - tokenId does not exist"
        );

        address bondedToken = nftRegistry.getBondedERC20(_tokenId);
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _liquidationAmount
        );

        // Calc fees
        uint256 pFees = (reserveAmount * PLATFORM_CUT) / MATH_PRECISION;

        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount - pFees;

        // Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = (_liquidationAmount * 1e18) / effectiveReserveAmount;
        reserveImpact = (reserveAmount * 1e18) / ERC20Manager.poolBalance(bondedToken);
    }

    /**
     * Internal create ERC721 and issues first bonded tokens
     * @param _tokenId tokenId to create
     * @param _symbol token symbol
     * @param _name token name
     * @param _minLiquidityAmount creation value for the card
     */
    function _createCard(
        uint256 _tokenId,
        string memory _symbol,
        string memory _name,
        uint256 _minLiquidityAmount 
    )
        private
    {            
        // Create NFT. sets owner to this contract's owner
        nftRegistry.mintToken(_tokenId, owner(), _symbol, _name);
        nftRegistry.mintBondedERC20(
            _tokenId, 
            address(this), 
            ERC20_INITIAL_SUPPLY, 
            _minLiquidityAmount
        );
        
        address bondedToken = nftRegistry.getBondedERC20(_tokenId);
        address[] memory senders = unlockRegistry.getContributorsFor(_tokenId);

        // send shares to liquidity contributors
        for (uint256 i = 0; i < senders.length; i++) {
            
            // calculate 
            uint256 contribuition = unlockRegistry.getSenderContributionFor(
                senders[i], _tokenId
            );
            
            uint256 tokens = (ERC20_INITIAL_SUPPLY * contribuition) / _minLiquidityAmount; // amount
            
            ERC20Manager.transfer(bondedToken, senders[i], tokens);
        }

        // free unused space
        unlockRegistry.clearContributorsFor(_tokenId);
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function _isValidAdminHash(bytes32 _hash, bytes memory _sig) private view returns (bool) {
        return validAdminAddress == _hash.toEthSignedMessageHash().recover(_sig);
    }
}
