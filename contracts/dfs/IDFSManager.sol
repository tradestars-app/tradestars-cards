// SPDX-License-Identifier: MIT
    
pragma solidity ^0.8.0;

import "./IContestStorage.sol";


interface IDFSManager {

    function createContest(
        IContestStorage.ContestInfo memory _contestArgs,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _eip721OrderExpiration,
        bytes32 _eip721OrderId,
        bytes memory _eip712TransferSignature
    ) 
        external;

    function editContest(
        bytes32 _contestHash,
        IContestStorage.ContestInfo memory _contestArgs,
        bytes memory _orderAdminSignature
    ) 
        external;

    function createContestEntry(
        bytes32 _contestHash,
        uint256 _entryFee,
        bytes memory _draftedPlayers,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    )
        external;

    function editContestEntry(
        bytes32 _entryHash,
        bytes memory _draftedPlayers,
        bytes memory _orderAdminSignature
    )
        external;

    function claimContesEntry(
        uint256 _claimedAmount,
        bytes32[] memory _entryHashArr,
        bytes memory _orderAdminSignature
    )
        external;
}