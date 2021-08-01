// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ICard.sol";

import "../lib/ERC20Manager.sol";
import "../utils/GasPriceLimited.sol";

import "../fractionable/IFractionableERC721.sol";

import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


// Main Contract

contract PerformanceCard is ICard, GasPriceLimited {

    using ECDSA for bytes32;
    using SafeMath for uint256;
    using SafeERC20 for IERC20;

    // .0001 precision.
    uint32 public constant MATH_PRECISION = 1e4;

    // Constant values for creating bonded ERC20 tokens.
    uint256 public constant ERC20_INITIAL_SUPPLY = 10000e18; // 10000 units
    uint256 public constant PLATFORM_CUT = 50; // .5%

    // Reserve Token.
    IERC20 private immutable reserveToken;

    // Registry
    IFractionableERC721 private immutable nftRegistry;

    // Relayed signatures map
    mapping(bytes => bool) private relayedSignatures;

    // partial unlocks
    struct TokenInfo {
        uint256 total;
        address[] senders;
        mapping(address => uint256) index;
        mapping(address => uint256) contributions;
    }

    mapping(uint256 => TokenInfo) private partialTokensRegistry;

    /**
     * @dev Initializer for PerformanceCard contract
     * @param _nftRegistry - NFT Registry address
     * @param _reserveToken - Reserve registry address
     */
     constructor(address _nftRegistry, address _reserveToken) {
        // Set Reseve Token addresses
        reserveToken = IERC20(_reserveToken);

        // Set the NFT Registry
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

        // Check hashed message & signature
        bytes32 _hash = keccak256(
            abi.encodePacked(_nonce, _signer, _abiEncoded, block.chainid)
        );

        require(
            _signer == _hash.toEthSignedMessageHash().recover(_orderHashSignature),
            "PerformanceCard: invalid signature verification"
        );

        relayedSignatures[_orderHashSignature] = true;

        // Append signer address at the end to extract it from calling context
        (bool success, bytes memory returndata) = address(this).call(
            abi.encodePacked(_abiEncoded, _signer)
        );

        if (success) {
            return returndata;
        }

        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {

            // solhint-disable-next-line no-inline-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }

        } else {
            revert("PerformanceCard: error in call()");
        }
    }

    /**
     * @dev Upgrades Performance Card. Can only be called by owner. 
     * @param _newCardContract new PerformanceCard
     */ 
    function upgrade(address _newCardContract) external onlyOwner {    

        // transfer to new reserve contract
        uint256 reserveAmount = reserveToken.balanceOf(address(this));
        
        reserveToken.transfer(
            _newCardContract, 
            reserveAmount
        );

        // send possible remaining funds
        selfdestruct(payable(owner()));
    }

    /**
     * @dev Create Performance Card
     * @param _tokenId card id
     * @param _symbol card symbol
     * @param _name card name
     * @param _cardUnlockReserveAmount creation value for the card
     * @param _unlockContributionAmount creation value for the card
     * @param _msgHash hash of card parameters
     * @param _signature admin signature
     */
    function createCard(
        uint256 _tokenId,
        string memory _symbol,
        string memory _name,
        uint256 _cardUnlockReserveAmount,
        uint256 _unlockContributionAmount,
        bytes32 _msgHash,
        bytes memory _signature
    )
        public gasPriceLimited
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) == address(0),
            "PerformanceCard: card already created"
        );

        // Check hashed message & admin signature
        bytes32 checkHash = keccak256(
            abi.encodePacked(_tokenId, _symbol, _name, _cardUnlockReserveAmount)
        );

        require(
            checkHash == _msgHash,
            "PerformanceCard: invalid msgHash"
        );

        require(
            _isValidAdminHash(_msgHash, _signature),
            "PerformanceCard: invalid admin signature"
        );

        // operator is approved already
        reserveToken.safeTransferFrom(
            msgSender(), 
            address(this), 
            _unlockContributionAmount
        );

        // check unlocker
        TokenInfo storage t = partialTokensRegistry[_tokenId];

        uint256 contribution = t.contributions[msgSender()];

        // if already contributed, refund previous
        if (contribution > 0) {
            t.total = t.total - contribution;

            // remove from array 
            uint256 index = t.index[msgSender()];
            
            // remove last and place it in current deleted item
            address lastItem = t.senders[t.senders.length - 1];

            // set last item in place of deleted
            t.senders[index] = lastItem;
            t.senders.pop();

            // update index map
            t.index[lastItem] = index; 
            
            // delete removed address from index map
            delete t.index[msgSender()];

            // refund last contribution
            reserveToken.transfer(msgSender(), contribution);
        }

        // save partial contribution
        t.total = t.total.add(_unlockContributionAmount);

        // Refund extra contribution
        if (t.total > _cardUnlockReserveAmount) {
            uint256 refund = t.total - _cardUnlockReserveAmount;

            t.total -= refund;
            _unlockContributionAmount -= refund;

            reserveToken.transfer(msgSender(), refund);
        }

        // save contributor
        t.contributions[msgSender()] = _unlockContributionAmount;
        t.index[msgSender()] = t.senders.length;
        
        // add contributor to senders list
        t.senders.push(msgSender());

        emit UnlockDeposit(msgSender(), _tokenId, _unlockContributionAmount);

        // if filled
        if (t.total == _cardUnlockReserveAmount) {
            _createCard(_tokenId, _symbol, _name, _cardUnlockReserveAmount);
        }
    }

    /**
     * Swap two fractionable ERC721 tokens.
     * @param _tokenId tokenId to liquidate
     * @param _amount wei amount of liquidation in source token.
     * @param _destTokenId tokenId to purchase.
     */
    function swap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        public override gasPriceLimited
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

        // Burn selled tokens and mint buyed
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
        public view override returns (uint expectedRate, uint slippageRate)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        require(
            nftRegistry.getBondedERC20(_destTokenId) != address(0),
            "PerformanceCard: destTokenId does not exist"
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
        uint256 _paymentAmount
    )
        public override gasPriceLimited
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        // operator is approved already
        reserveToken.safeTransferFrom(
            msgSender(), 
            address(this), 
            _paymentAmount
        );

        // transfer platform cut.
        uint256 pFee = _paymentAmount.mul(PLATFORM_CUT).div(MATH_PRECISION);
        reserveToken.safeTransfer(owner(), pFee);

        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = _paymentAmount.sub(pFee);

        // The estimated amount of bonded tokens for reserve
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _tokenId,
            effectiveReserveAmount
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
     * Estimate Purchase of a fractionable ERC721 using sTSX
     * @param _tokenId tokenId to purchase
     * @param _paymentAmount wei payment amount in payment token
     */
    function estimatePurchase(
        uint256 _tokenId,
        uint256 _paymentAmount
    )
        public view override returns (uint expectedRate, uint slippageRate)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        // Calc fees
        uint256 pFees = _paymentAmount.mul(PLATFORM_CUT).div(MATH_PRECISION);

        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = _paymentAmount.sub(pFees);

        // Get estimated amount of _tokenId for effectiveReserveAmount
        uint256 estimatedTokens = nftRegistry.estimateBondedERC20Tokens(
            _tokenId,
            effectiveReserveAmount
        );

        address bondedToken = nftRegistry.getBondedERC20(_tokenId);

        // Return the expected exchange rate and slippage in 1e6 precision
        expectedRate = estimatedTokens.mul(1e6).div(_paymentAmount);
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
        public override gasPriceLimited
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        // Estimate reserve for selling _tokenId
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _liquidationAmount
        );

        // Burn selled tokens.
        nftRegistry.burnBondedERC20(
            _tokenId,
            msgSender(),
            _liquidationAmount,
            reserveAmount
        );

        // fees
        uint256 pFee = reserveAmount.mul(PLATFORM_CUT).div(MATH_PRECISION);
        reserveToken.safeTransfer(owner(), pFee);

        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(pFee);

        // Trade reserve to sTSX and send to liquidator
        reserveToken.safeTransfer(msgSender(), effectiveReserveAmount);
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
        public view override returns (uint expectedRate, uint slippageRate)
    {
        require(
            nftRegistry.getBondedERC20(_tokenId) != address(0),
            "PerformanceCard: tokenId does not exist"
        );

        address bondedToken = nftRegistry.getBondedERC20(_tokenId);
        uint256 reserveAmount = nftRegistry.estimateBondedERC20Value(
            _tokenId,
            _liquidationAmount
        );

        // Calc fees
        uint256 pFees = reserveAmount.mul(PLATFORM_CUT).div(MATH_PRECISION);

        // Get effective amount after tx fees
        uint256 effectiveReserveAmount = reserveAmount.sub(pFees);

        // Return the expected exchange rate and slippage in 1e18 precision
        expectedRate = _liquidationAmount.mul(1e6).div(effectiveReserveAmount);
        slippageRate = reserveAmount.mul(1e18).div(
            ERC20Manager.poolBalance(bondedToken)
        );
    }

    /**
     * Internal create ERC721 and issues first bonded tokens
     * @param _tokenId tokenId to create
     * @param _symbol token symbol
     * @param _name token name
     * @param _cardUnlockReserveAmount total reserve for the supply
     */
    function _createCard(
        uint256 _tokenId,
        string memory _symbol,
        string memory _name,
        uint256 _cardUnlockReserveAmount 
    )
        private
    {
        TokenInfo storage t = partialTokensRegistry[_tokenId];
            
        // Create NFT
        // - The NFT owner is platform owner
        // - The ERC20_INITIAL_SUPPLY is for msgSender()
        //
        nftRegistry.mintToken(_tokenId, owner(), _symbol, _name);
        nftRegistry.mintBondedERC20(
            _tokenId, address(this), ERC20_INITIAL_SUPPLY, _cardUnlockReserveAmount
        );
        
        address bondedToken = nftRegistry.getBondedERC20(_tokenId);

        // send initial shares to unlockers
        for (uint256 i = 0; i < t.senders.length; i++) {
            
            // calculate 
            address sender = partialTokensRegistry[_tokenId].senders[i];
            uint256 contribuition = partialTokensRegistry[_tokenId].contributions[sender];
            
            uint256 tokens = ERC20_INITIAL_SUPPLY
                .mul(contribuition)
                .div(_cardUnlockReserveAmount); // amount
            
            ERC20Manager.transfer(bondedToken, sender, tokens);
        }

        // remove 
        delete partialTokensRegistry[_tokenId];
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
        return payable(msg.sender);
    }
}
