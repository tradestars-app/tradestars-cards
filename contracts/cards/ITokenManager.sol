// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

interface ITokenManager {

    function swap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId,
        uint256 _minDstTokenAmount
    )
        external;

    function purchase(
        uint256 _tokenId,
        uint256 _paymentAmount,
        uint256 _minDstTokenAmount,
        // EIP712 sigTransfer
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    )
        external;

    function liquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount,
        uint256 _minDstTokenAmount
    )
        external;

    function estimateSwap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        external view returns (uint256 expectedRate, uint256 reserveImpact);

    function estimatePurchase(
        uint256 _tokenId,
        uint256 _paymentAmount
    )
        external view returns (uint256 expectedRate, uint256 reserveImpact);

    function estimateLiquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount
    )
        external view returns (uint256 expectedRate, uint256 reserveImpact);
}
