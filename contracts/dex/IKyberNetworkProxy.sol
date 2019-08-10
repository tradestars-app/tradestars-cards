pragma solidity ^0.5.8;

import "openzeppelin-eth/contracts/token/ERC20/IERC20.sol";

interface IKyberNetworkProxy {

    function getExpectedRate(
        IERC20 _srcToken,
        IERC20 _destToken,
        uint _srcAmount
    )
        external view returns (uint expectedRate, uint slippageRate);

    function trade(
        IERC20 _srcToken,
        uint _srcAmount,
        IERC20 _destToken,
        address _destAddress,
        uint _maxDestAmount,
        uint _minConversionRate,
        address _walletId
    )
        external payable returns (uint);
}