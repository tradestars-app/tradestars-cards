// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IContestStorage {

    struct ContestInfoStorage {
        bool isCanceled;
        address creator;
        //
        uint32 participantsCount;
        //
        ContestInfo contestInfo;
    }

    struct ContestInfo {
        uint256 entryFee;
        //
        uint256 startTime;
        uint256 endTime;
        //
        bool isGuaranteed;
        // 
        uint8 contestIdType;
        uint8 maxDraftsPerParticipant;
        // 
        uint32 maxParticipants;
        //
        bytes selectedGames;
    }

    struct EntryInfo {
        address owner;
        bool isClaimed;
        bytes draftedPlayers;
    }

    // Contest Events

    event CreateContest(
        address indexed creator,
        bytes32 indexed contestHash,
        ContestInfo contestArgs
    );

    event EditContest(
        address indexed creator,
        bytes32 indexed contestHash,
        ContestInfo contestArgs
    );

    // Entry Events

    event CreateEntry(
        bytes32 indexed entryHash,
        bytes32 indexed contestHash,
        address indexed participant,
        bytes draftedPlayers
    );
    
    event EditEntry(
        bytes32 indexed entryHash,
        bytes32 indexed contestHash,
        address indexed participant,
        bytes draftedPlayers
    );
    
    event ClaimEntry(
        address indexed participant,
        bytes32 indexed entryHash
    );

    // contest related API

    function getContestData(
        bytes32 _contestHash
    ) 
        external returns (address, uint256);

    function createContest(
        address _creator,
        ContestInfo memory _contestArgs
    ) 
        external;

    function editContest(
        address _creator,
        bytes32 _contestHash,
        ContestInfo memory _contestArgs
    ) 
        external;

    // entries related API

    function addEntry(
        address _participant,
        bytes32 _contestHash,
        bytes memory _draftedPlayers
    ) 
        external;

    function editEntry(
        address _participant,
        bytes32 _entryHash,
        bytes32 _contestHash,
        bytes memory _draftedPlayers
    ) 
        external;

    function claimEntry(
        address _participant,
        bytes32 _entryHash
    ) 
        external;
}