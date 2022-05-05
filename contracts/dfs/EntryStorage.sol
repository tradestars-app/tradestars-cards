// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IEntryStorage.sol";
import "../commons/OperationManaged.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract EntryStorage is OperationManaged, IEntryStorage {

    // entry => sender 
    mapping(bytes32 => address) public entriesHash;

    // unique entry id. 
    uint256 public entryNonce;

    /**
     * @dev Creates a new contest entry.  
     * @param _sender of the order
     * @param _contestHash for the entry
     * @param _draftedPlayers array of concatenated playerIds of the draft
     */
    function createEntry(
        address _sender, 
        bytes32 _contestHash, 
        bytes memory _draftedPlayers
    ) 
        external override onlyOperationManager
    {
        bytes32 entryHash = keccak256(
            abi.encodePacked(
                _sender,
                _contestHash, 
                // add unique id
                entryNonce
            )
        );

        require(
            entriesHash[entryHash] == address(0),
            "createEntry() - Entry is already created"
        );
        
        // We need to associate entries with sender for edit / claim
        entriesHash[entryHash] = _sender;
        entryNonce += 1;
        
        emit CreateEntry(
            entryHash, 
            _sender, 
            _contestHash, 
            _draftedPlayers
        );
    }

    /**
     * @dev Edits an already created entry.  
     * @param _sender of the order
     * @param _entryHash for the entry
     * @param _draftedPlayers array of concatenated playerIds of the draft
     */
    function editEntry(
        address _sender, 
        bytes32 _entryHash,
        bytes memory _draftedPlayers
    ) 
        external override onlyOperationManager
    {
        require(
            entriesHash[_entryHash] == _sender,
            "editEntry() - invalid owner"
        );

        emit EditEntry(
            _sender, 
            _entryHash, 
            _draftedPlayers
        );
    }

    /**
     * @dev Claims entries
     * @param _sender of the order
     * @param _entryHash array of claimed entries
     */
    function claimEntry(
        address _sender,
        bytes32 _entryHash
    ) 
        public override onlyOperationManager 
    {
        require(
            entriesHash[_entryHash] == _sender,
            "claimEntry() - invalid owner"
        );

        delete entriesHash[_entryHash];

        emit ClaimEntry(_sender, _entryHash);
    }
}