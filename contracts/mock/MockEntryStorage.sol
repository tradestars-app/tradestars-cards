// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../dfs/IEntryStorage.sol";

contract MockEntryStorage is IEntryStorage {
    function createEntry(
        address _sender, 
        bytes32 _contestHash, 
        bytes memory _draftedPlayers
    ) 
        external override
    {

    }

    function editEntry(
        address _sender, 
        bytes32 _entryHash,
        bytes memory _draftedPlayers
    ) 
        external override 
    {

    }

    function claimEntry(
        address _sender, 
        bytes32 _entryHash
    ) 
        external override
    {

    }
}