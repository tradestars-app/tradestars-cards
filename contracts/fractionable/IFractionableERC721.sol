pragma solidity ^0.5.8;

interface IFractionableERC721 {

    event TransferBondedERC20(
        uint256 indexed tokenId,
        address indexed from,
        address indexed to,
        uint256 amount,
        uint256 value
    );

    function swap(uint256 _tokenId, uint256 _amount, uint256 _destTokenId) external;
    function liquidate(uint256 _tokenId, uint256 _liquidationAmount, address _paymentToken) external;
    function purchase(uint256 _tokenId, address _paymentToken, uint256 _paymentAmount) external payable;

    function estimateSwap(
        uint256 _tokenId,
        uint256 _amount,
        uint256 _destTokenId
    )
        external view returns (uint expectedRate, uint slippageRate);

    function estimatePurchase(
        uint256 _tokenId,
        address _paymentToken,
        uint256 _paymentAmount
    )
        external view returns (uint expectedRate, uint slippageRate);

    function estimateLiquidate(
        uint256 _tokenId,
        uint256 _liquidationAmount,
        address _paymentToken
    )
        external view returns (uint expectedRate, uint slippageRate);
}