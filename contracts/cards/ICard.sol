// SPDX-License-Identifier: MIT

pragma solidity ^0.6.8;

interface ICard {

    function swap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        external;

    function purchase(
        uint256 _tokenId,
        uint256 _paymentAmount,
        uint256 _expiration,
        bytes32 _orderId,
        bytes calldata _orderSignature
    )
        external;

    function liquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount
    )
        external;

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
