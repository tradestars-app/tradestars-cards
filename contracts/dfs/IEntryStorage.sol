// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IEntryStorage {
    
    event CreateEntry(
        bytes32 entyHash,
        address indexed from,
        bytes32 indexed contestHash,
        bytes draftedPlayers
    );

    event EditEntry(
        address indexed from,
        bytes32 entryHash,
        bytes draftedPlayers
    );

    event ClaimEntry(
        address indexed from,
        bytes32 entryHash
    );

    function createEntry(
        address _sender, 
        bytes32 _contestHash, 
        bytes memory _draftedPlayers
    ) 
        external;

    function editEntry(
        address _sender, 
        bytes32 _entryHash,
        bytes memory _draftedPlayers
    ) 
        external;

    function claimEntry(
        address _sender, 
        bytes32 _entryHash
    ) 
        external;
}