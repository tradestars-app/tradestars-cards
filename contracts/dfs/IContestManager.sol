// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IContestManager {
    
    event Entry(
        address indexed from,
        uint256 indexed contestId,
        uint256 entryFee,
        uint256[] playersArr
    );

    event Claim(
        address indexed from,
        uint256 indexed contestId,
        uint256 claimAmount
    );
  
    function createEntry(
        uint256 _contestId,
        uint256 _entryFee,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    )
        external;

    function claimReward(
        uint256 _contestId,
        uint256 _rewardAmount,
        bytes memory _orderAdminSignature
    )
        external;
}