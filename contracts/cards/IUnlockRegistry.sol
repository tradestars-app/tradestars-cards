
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IUnlockRegistry {
    
    event LiquidityContribution(
        address indexed from,
        uint256 indexed tokenId,
        uint256 amount
    );
    
    struct LiquidityInfo {
        uint256 total;
        address[] senders;
        mapping(address => uint256) index;
        mapping(address => uint256) contributions;
    }

    function getContributorsFor(uint256 _tokenId) external view returns (
        address[] memory senders
    );

    function getSenderContributionFor(address _sender, uint256 _tokenId) external view returns (
        uint256 contribution
    );

    function clearContributorsFor(uint256 _tokenId) external;

    function addContribution(
        uint256 _tokenId, 
        address _sender, 
        uint256 _amount,
        uint256 _tokenIdMaxAmount
    ) 
        external returns (uint256 refund, bool contributionCompleted);
}