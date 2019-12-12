pragma solidity ^0.5.12;

interface ITConverter {

    /// Events.
    event SwapToken(
        address indexed srcToken,
        address indexed destToken,
        uint256 srcAmount,
        uint256 dstAmount
    );

    function getExpectedRate(
        address _srcToken,
        address _destToken,
        uint256 _amount
    )
        external view returns (uint256);

    function trade(
        address _srcToken,
        address _destToken,
        uint256 _srcAmount
    )
        external returns (uint256);
}