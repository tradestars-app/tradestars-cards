// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IContestStorage {
    
    struct ContestInfo {
        address creator;
        uint256 entryFee;
        uint8 contestIdType;
        uint8 platformCut;
        uint8 creatorCut; 
        uint32 maxParticipants;
        uint32 participantsCount;
        bytes selectedGames;
    }

    event CreateContest(
        bytes32 contestHash,
        address indexed creator,
        uint256 entryFee,
        uint32 maxParticipants,
        uint8 contestIdType,
        uint8 platformCut,
        uint8 creatorCut,
        bytes selectedGames
    );

    event EditContest(
        bytes32 contestHash,
        address indexed creator,
        uint256 entryFee,
        uint32 maxParticipants,
        uint8 contestIdType,
        uint8 platformCut,
        uint8 creatorCut,
        bytes selectedGames
    );

    function getContestByHash(
        bytes32 _contestHash
    ) 
        external returns (ContestInfo memory);

    function createContest(
        address _sender, 
        bytes memory _selectedGames,
        uint256 _entryFee, 
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut
    ) 
        external;

    function editContest(
        address _sender, 
        bytes32 _contestHash,
        bytes memory _selectedGames,
        uint256 _entryFee, 
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut
    ) 
        external;
}