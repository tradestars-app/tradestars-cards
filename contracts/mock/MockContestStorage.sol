// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../dfs/IContestStorage.sol";

contract MockContestStorage is IContestStorage {
    
    function getContestByHash(
        bytes32 _contestHash
    ) 
        external pure override returns (ContestInfo memory) 
    {

    }

    function createContest(
        address _sender, 
        bytes memory _selectedGames,
        uint256 _entryFee, 
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut
    ) 
        external override
    {

    }

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
        external override
    {
        
    }
}