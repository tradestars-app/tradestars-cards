// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IContestStorage.sol";
import "../commons/OperationManaged.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract ContestStorage is OperationManaged, IContestStorage {

    // contestHash => ContestInfo 
    mapping(bytes32 => ContestInfoStorage) private contestInfoHash;

    // entryHash => EntryInfo
    mapping(bytes32 => EntryInfo) entryInfoHash;

    // we keep draftcount per contest / participant
    mapping(bytes32 => mapping(address => uint8)) participantDraftsCount;

    // contest counter
    uint256 public contestNonce;

    // entry counter
    uint256 public entryNonce;

    /**
     * @dev gets contest creator and entryFee 
     * @param _contestHash hash of the contest to lookup
     */
    function getContestData(
        bytes32 _contestHash
    ) 
        external override returns (address creator, uint256 entryFee) 
    {
        ContestInfoStorage storage cie = _getContestInfoStorageByHash(_contestHash); 

        creator = cie.creator;
        entryFee = cie.contestInfo.entryFee;
    }

    /**
     * @dev gets ContestInfoStorage by contestHash checking existance
     * @param _contestHash hash of the contest to resturn fees from
     */
    function _getContestInfoStorageByHash(
        bytes32 _contestHash
    ) 
        internal view returns (ContestInfoStorage storage cie) 
    {
        cie = contestInfoHash[_contestHash];

        require(
            cie.creator != address(0), 
            "_getContestInfoStorageByHash() - invalid contest hash"
        );
    }

    /**
     * @dev Creates a new contest entry.  
     * @param _contestArgs contest info order 
     */
    function createContest(
        address _creator,
        ContestInfo memory _contestArgs
    ) 
        external override onlyOperationManager
    {
        /// incremente nonce
        contestNonce += 1;

        // NOTE: using encodePacked vs encode. Check client hash algo
        bytes32 newContestHash = keccak256(
            abi.encodePacked(_creator, contestNonce)
        );

        require(
            _contestArgs.startTime <= block.timestamp,
            "createContest() - invalid startTime"
        );

        ContestInfo memory newContestInfo = ContestInfo({
            entryFee: _contestArgs.entryFee,
            //
            startTime: _contestArgs.startTime,
            endTime: _contestArgs.endTime,
            //
            isGuaranteed: _contestArgs.isGuaranteed,
            //
            contestIdType: _contestArgs.contestIdType,
            maxDraftsPerParticipant: _contestArgs.maxDraftsPerParticipant,
            //
            maxParticipants: _contestArgs.maxParticipants,
            //
            selectedGames: _contestArgs.selectedGames
        });

        /// save contest params create contest
        contestInfoHash[newContestHash] = ContestInfoStorage({
            creator: _creator,
            isCanceled: false,
            participantsCount: 0,
            contestInfo: newContestInfo
        });

        emit CreateContest(
            _creator,
            newContestHash,
            newContestInfo
        );
    }

    /**
     * @dev Edits an already created contest.
     * @param _creator for the contest
     * @param _contestHash for the contest
     * @param _contestArgs new contest params 
     */
    function editContest(
        address _creator,
        bytes32 _contestHash,
        ContestInfo memory _contestArgs
    ) 
        external override onlyOperationManager
    {
        ContestInfoStorage storage cie = _getContestInfoStorageByHash(_contestHash);
        ContestInfo storage ci = cie.contestInfo;
     
        require(
            cie.creator == _creator,
            "EditContest() - invalid creator"
        );
        
        require(
            cie.participantsCount == 0,
            "EditContest() - contest has entries"
        );        

        require(
            ci.startTime <= block.timestamp,
            "EditContest() - contest started"
        );


        // change contest params
        ci.startTime = _contestArgs.startTime;
        ci.endTime = _contestArgs.endTime;
        ci.selectedGames = _contestArgs.selectedGames;
        ci.contestIdType = _contestArgs.contestIdType;

        emit EditContest(
            _creator,
            _contestHash, 
            ci
        );
    }

    /**
     * @dev Add entry hash to contest
     * @param _participant sender of the entry
     * @param _contestHash for to add the new entry
     * @param _draftedPlayers for the entry
     */
    function addEntry(
        address _participant,
        bytes32 _contestHash,
        bytes memory _draftedPlayers
    ) 
        external override onlyOperationManager
    {
        ContestInfoStorage storage cie = _getContestInfoStorageByHash(_contestHash);
        ContestInfo storage ci = cie.contestInfo;
        
        require(
            ci.startTime <= block.timestamp,
            "addEntry() - contest started"
        );
        
        // check and increase contest participants counter
        require(
            cie.participantsCount < ci.maxParticipants, 
            "addEntry() - contest full"
        );

        cie.participantsCount += 1;

        // check and increase participants' draft counter for the contest 
        require(
            participantDraftsCount[_contestHash][_participant] < ci.maxParticipants,
            "addEntry() - max drafts reached for contest"
        );

        participantDraftsCount[_contestHash][_participant] += 1;

        // Creates entry and adds to associative data structs
        _createEntry(
            _participant, 
            _contestHash, 
            _draftedPlayers
        );
    }

    /**
     * @dev Edits a contest entry.  
     * @param _participant of the order
     * @param _entryHash for the entry
     * @param _contestHash for the entry
     * @param _draftedPlayers of the entry
     */
    function editEntry(
        address _participant,
        bytes32 _entryHash,
        bytes32 _contestHash,
        bytes memory _draftedPlayers
    ) 
        external override onlyOperationManager 
    {
        ContestInfoStorage storage cie = _getContestInfoStorageByHash(_contestHash);
        ContestInfo storage ci = cie.contestInfo;
        
        require(
            ci.startTime <= block.timestamp,
            "editEntry() - contest started"
        );

        EntryInfo storage ei = entryInfoHash[_entryHash];

        require(
            ei.owner == _participant,
            "editEntry(): invalid owner"
        );

        // modify entry
        ei.draftedPlayers = _draftedPlayers;

        emit EditEntry(
            _entryHash, 
            _participant, 
            _contestHash, 
            _draftedPlayers
        );
    }

    /**
     * @dev Claims entry
     * @param _participant of the order
     * @param _entryHash array of claimed entries
     */
    function claimEntry(
        address _participant,
        bytes32 _entryHash
    ) 
        external override onlyOperationManager 
    {
        EntryInfo storage ei = entryInfoHash[_entryHash];

        require(
            ei.owner == _participant,
            "claimEntry(): invalid owner"
        );

        require(
            ei.isClaimed == false,
            "claimEntry(): already claimed"
        );

        ei.isClaimed = true;

        emit ClaimEntry(_participant, _entryHash);
    }

    /**
     * @dev Creates a new contest entry.  
     * @param _participant creator of the entry
     * @param _contestHash for the new entry
     * @param _draftedPlayers of the entry
     */
    function _createEntry(
        address _participant, 
        bytes32 _contestHash,
        bytes memory _draftedPlayers
    ) 
        private
    {
        // increase nonce
        entryNonce += 1;

        bytes32 entryHash = keccak256(
            abi.encodePacked(
                _participant,
                _contestHash, 
                _draftedPlayers,
                // add unique id
                entryNonce
            )
        );

        // add to contest entries hash        
        entryInfoHash[entryHash] = EntryInfo({
            isClaimed: false,
            owner: _participant,
            draftedPlayers: _draftedPlayers
        });

        emit CreateEntry(
            entryHash, 
            _participant, 
            _contestHash, 
            _draftedPlayers
        );
    }
}