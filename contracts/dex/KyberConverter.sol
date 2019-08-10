pragma solidity ^0.5.8;

import "./IKyberNetworkProxy.sol";
import "../utils/Administrable.sol";

import "openzeppelin-eth/contracts/token/ERC20/SafeERC20.sol";

/**
 * Note: need to create it with a valid kyber address
 *  The fee wallet is 0 at the creation time.
 */
contract KyberConverter is Administrable {

    using SafeERC20 for IERC20;

    uint256 private constant UINT256_MAX = ~uint256(0);

    /// Events.
    event SwapToken(address indexed sender, address srcToken, address destToken);
    event SwapFeeWallet(address indexed sender);

    /// Kyber proxy address
    IKyberNetworkProxy private kyber;

    /// Fee wallet address
    address private walletId;

    /**
     * @dev Sets the receiving address of swap fees when using kyber
     * @param _walletId address to receive fees
     */
    function setKyberFeeWallet(address _walletId) external onlyAdmin {
       walletId = _walletId;
       emit SwapFeeWallet(msg.sender);
    }

    function initialize(
        address _kyberProxy,
        address _walletId
    )
        public initializer
    {
        kyber = IKyberNetworkProxy(_kyberProxy);
        walletId = _walletId;
    }

    /**
     * @dev Use kyber proxy to get expected ERC20 token conversion.
     * @param _srcToken ERC20 source token registry
     * @param _destToken ERC20 destination token registry
     * @param _srcAmount source token amount to swap
     */
    function _getExpectedRate(
        IERC20 _srcToken,
        IERC20 _destToken,
        uint256 _srcAmount
    )
        internal view returns (uint expectedRate, uint slippageRate)
    {
        return kyber.getExpectedRate(_srcToken, _destToken, _srcAmount);
    }

    /**
     * @dev Use kyber proxy to swap ERC20 tokens.
     * @param _srcToken ERC20 source token registry
     * @param _destToken ERC20 destination token registry
     * @param _srcAmount source token amount to swap
     * @param _destAmount destination token amount to get. If 0, all source tokens will be swapped.
     * @param _minConversionRate min conversion rate to use. If 0, will use the minimum available.
     * @param _dstAddress destination address for the converted tokens.
     */
    function _swapTokens(
        IERC20 _srcToken,
        IERC20 _destToken,
        uint256 _srcAmount,
        uint256 _destAmount,
        uint256 _minConversionRate,
        address _dstAddress
    )
        internal returns (uint retAmount)
    {
        /// Transfer tokens to be converted from msg.sender to this contract
        _srcToken.safeTransferFrom(msg.sender, address(this), _srcAmount);

        /// Approve Kyber to use _srcToken on belhalf of this contract
        _srcToken.safeApprove(address(kyber), 0);
        _srcToken.safeApprove(address(kyber), _srcAmount);

        /// Trade _srcAmount from _srcToken to _destToken
        /// If _destAmount is set to 0, we use UINT256_MAX so all source tokens gets converted.
        retAmount = kyber.trade.value(msg.value)(
            _srcToken,
            _srcAmount,
            _destToken,
            _dstAddress,
            _destAmount > 0 ? _destAmount : UINT256_MAX,
            _minConversionRate,
            walletId
        );

        emit SwapToken(msg.sender, address(_srcToken), address(_destToken));
    }
}
