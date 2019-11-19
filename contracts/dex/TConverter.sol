pragma solidity ^0.5.12;

import "./ITConverter.sol";

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";

contract TConverter is ITConverter, Ownable {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// conversion precision
    uint256 public constant CONVERT_PRECISION = 1e18;

    function initialize(address _owner) public initializer {
        Ownable.initialize(_owner);
    }

    /**
     * @dev Get expected ERC20 pair conversion rate
     * @param _srcToken ERC20 source token registry
     * @param _destToken ERC20 destination token registry
     */
    function getExpectedRate(
        address _srcToken,
        address _destToken
    )
        public view returns (uint256)
    {
        uint256 srcBalance = IERC20(_srcToken).balanceOf(address(this));
        uint256 destBalance = IERC20(_destToken).balanceOf(address(this));

        return srcBalance.mul(CONVERT_PRECISION).div(destBalance);
    }

    /**
     * @dev Trade ERC20 token pairs.
     * @param _srcToken source token to swap
     * @param _destToken destination token to swap to
     * @param _srcAmount source token amount to swap
     */
    function trade(
        address _srcToken,
        address _destToken,
        uint256 _srcAmount
    )
        public returns (uint256)
    {
        require(
            IERC20(_srcToken).balanceOf(msg.sender) >= _srcAmount,
            "Insufficient src token funds"
        );
        require(
            IERC20(_srcToken).allowance(msg.sender, address(this)) >= _srcAmount,
            "Insufficient src token allowance"
        );

        uint256 rate = getExpectedRate(_srcToken, _destToken);
        uint256 destAmount = _srcAmount.mul(rate).div(CONVERT_PRECISION);

        require(
            IERC20(_srcToken).balanceOf(address(this)) >= destAmount,
            "Insufficient dst token funds"
        );

        /// Transfer tokens to be converted from msg.sender to this contract
        IERC20(_srcToken).safeTransferFrom(msg.sender, address(this), _srcAmount);
        IERC20(_destToken).safeTransfer(msg.sender, destAmount);

        emit SwapToken(msg.sender, _srcToken, _destToken);

        return destAmount;
    }
}
