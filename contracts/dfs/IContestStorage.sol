// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IContestStorage {
    
    struct ContestInfo {
        address creator;
        uint256 entryFee;
        bytes selectedGames;
        uint8 contestIdType;
        uint8 platformCut;
        uint8 creatorCut; 
        uint32 participantsCount;
    }

    event CreateContest(
        bytes32 contestHash,
        address indexed creator,
        uint256 entryFee,
        bytes selectedGames,
        uint8 contestIdType,
        uint8 platformCut,
        uint8 creatorCut
    );

    event EditContest(
        bytes32 contestHash,
        address indexed creator,
        uint256 entryFee,
        bytes selectedGames,
        uint8 contestIdType,
        uint8 platformCut,
        uint8 creatorCut
    );

    function getContestByHash(
        bytes32 _contestHash
    ) 
        external returns (ContestInfo memory);

    function createContest(
        address _sender, 
        bytes memory _selectedGames,
        uint256 _entryFee, 
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut
    ) 
        external;

    function editContest(
        address _sender, 
        bytes32 _contestHash,
        uint256 _entryFee, 
        bytes memory _selectedGames,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut
    ) 
        external;
}