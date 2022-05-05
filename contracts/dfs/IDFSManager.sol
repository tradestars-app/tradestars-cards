// SPDX-License-Identifier: MIT
    
pragma solidity ^0.8.0;


interface IDFSManager {

    function createContest(
        uint256 _creationFee,
        uint256 _entryFee,
        bytes memory _selectedGames,
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    ) 
        external;

    function editContest(
        bytes32 _contestHash,
        bytes memory _selectedGames,
        uint256 _entryFee,
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut,
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