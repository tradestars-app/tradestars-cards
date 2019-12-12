pragma solidity ^0.5.12;

import "./ITConverter.sol";

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/SafeERC20.sol";

contract TConverter is ITConverter, Ownable {

    using SafeERC20 for IERC20;
    using SafeMath for uint256;

    /// conversion precision
    uint256 public constant CONVERT_PRECISION = 1e18;

    /// allowed trader address
    address private allowedCaller;

    function initialize(address _owner) public initializer {
        Ownable.initialize(_owner);
    }

    /**
     * @dev Sets the address allowed to trade
     * @param _caller address allowed to call trade()
     */
    function setAllowedCaller(address _caller) public onlyOwner {
        allowedCaller = _caller;
    }

    /**
     * @dev Get expected ERC20 pair conversion rate
     * @param _srcToken ERC20 source token registry
     * @param _destToken ERC20 destination token registry
     */
    function getExpectedRate(
        address _srcToken,
        address _destToken,
        uint256 _amount
    )
        public view returns (uint256)
    {
        uint256 srcBalance = IERC20(_srcToken).balanceOf(address(this));
        uint256 destBalance = IERC20(_destToken).balanceOf(address(this));

        return destBalance.mul(CONVERT_PRECISION).div(
            srcBalance.add(_amount)
        );
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
        require(msg.sender == allowedCaller, "caller is not allowed");

        uint256 rate = _getRate(_srcToken, _destToken);
        uint256 destAmount = _srcAmount.mul(rate).div(CONVERT_PRECISION);

        require(
            IERC20(_srcToken).balanceOf(address(this)) >= _srcAmount,
            "Insufficient src token funds"
        );

        require(
            IERC20(_destToken).balanceOf(address(this)) >= destAmount,
            "Insufficient dst token funds"
        );

        /// Transfer dst tokens to sender
        IERC20(_destToken).safeTransfer(msg.sender, destAmount);

        emit SwapToken(_srcToken, _destToken, _srcAmount, destAmount);

        return destAmount;
    }

    function _getRate(
        address _srcToken,
        address _destToken
    )
        public view returns (uint256)
    {
        uint256 srcBalance = IERC20(_srcToken).balanceOf(address(this));
        uint256 destBalance = IERC20(_destToken).balanceOf(address(this));

        return destBalance.mul(CONVERT_PRECISION).div(srcBalance);
    }
}
