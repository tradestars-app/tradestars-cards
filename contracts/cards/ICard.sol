pragma solidity ^0.5.8;

interface ICard {
    function swap(uint256 _tokenId, uint256 _amount, uint256 _destTokenId) external;
    function liquidate(uint256 _tokenId, uint256 _liquidationAmount) external;
    function purchase(uint256 _tokenId, uint256 _paymentAmount) external;

    function estimateSwap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        external view returns (uint expectedRate, uint slippageRate);

    function estimatePurchase(
        uint256 _tokenId,
        uint256 _paymentAmount
    )
        external view returns (uint expectedRate, uint slippageRate);

    function estimateLiquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount
    )
        external view returns (uint expectedRate, uint slippageRate);
}