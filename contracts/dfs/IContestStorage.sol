// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IContestStorage {

    struct ContestInfo {
        address creator;
        uint256 creationFee;
        uint256 entryFee;
        uint8 contestIdType;
        uint8 platformCut;
        uint8 creatorCut; 
        uint32 maxParticipants;
        uint32 participantsCount;
        bool isGuaranteed;
        bytes selectedGames;
    }

    event CreateContest(
        bytes32 contestHash,
        ContestInfo contestArgs
    );

    event EditContest(
        bytes32 contestHash,
        ContestInfo contestArgs
    );

    function getContestByHash(
        bytes32 _contestHash
    ) 
        external returns (ContestInfo memory);

    function increaseParticipantsCount(
        bytes32 _contestHash
    ) 
        external;

    function createContest(
        ContestInfo memory _contestArgs
    ) 
        external;

    function editContest(
        bytes32 _contestHash,
        ContestInfo memory _contestArgs
    ) 
        external;
}