// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IContestStorage.sol";
import "../commons/OperationManaged.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract ContestStorage is OperationManaged, IContestStorage {

    // contests => info 
    mapping(bytes32 => ContestInfo) private contestsInfoHash;

    /// contests => participants counter
    mapping(bytes32 => uint32) private contestsParticipants;

    // contest counter
    uint256 public contestNonce;

    /**
     * @dev gets Contest by contestHash, checking existance
     * @param _contestHash hash of the contest to resturn
     */
    function getContestByHash(
        bytes32 _contestHash
    ) 
        external view override returns (ContestInfo memory) 
    {
        require(
            contestsInfoHash[_contestHash].creator != address(0), 
            "getContestByHash() - invalid hash"
        );
        return contestsInfoHash[_contestHash];
    }

    /**
     * @dev Creates a new contest entry.  
     * @param _sender of the order
     * @param _selectedGames array of concatenated gameIds for the contest
     */
    function createContest(
        address _sender, 
        bytes memory _selectedGames,
        uint256 _entryFee, 
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut
    ) 
        external override onlyOperationManager
    {
        bytes32 contestHash = keccak256(
            abi.encodePacked(
                _sender, 
                contestNonce
            )
        );

        // We need to associate entries with sender for edit / claim
        ContestInfo storage ci = contestsInfoHash[contestHash];

        require(
            ci.creator == address(0),
            "createEntry() - Entry is already created"
        );
        
        /// save contest params create contest
        contestsInfoHash[contestHash] = ContestInfo({
            creator: _sender,
            entryFee: _entryFee,
            selectedGames: _selectedGames,
            contestIdType: _contestIdType,
            platformCut: _platformCut,
            creatorCut: _creatorCut,
            maxParticipants: _maxParticipants,
            participantsCount: 0
        });

        /// incremente nonce
        contestNonce += 1;
        
        emit CreateContest(
            contestHash, 
            _sender, 
            _entryFee,
            _maxParticipants,
            _contestIdType,
            _platformCut,
            _creatorCut,
            _selectedGames
        );
    }

    /**
     * @dev Edits an already created entry.
     * @param _sender of the order
     * @param _contestHash for the entry
     * @param _selectedGames array of concatenated playerIds of the draft
     * @param _entryFee for the entry
     * @param _maxParticipants allowed on the contest 
     * @param _contestIdType for the entry
     * @param _platformCut for the entry
     * @param _creatorCut for the entry
     */
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
        external override onlyOperationManager
    {
        ContestInfo storage ci = contestsInfoHash[_contestHash];
     
        require(
            ci.creator == _sender,
            "EditContest() - invalid owner"
        );

        require(
            ci.participantsCount == 0,
            "EditContest() - the contest has entries"
        );

        // change contest params
        ci.entryFee = _entryFee;
        ci.creatorCut = _creatorCut;
        ci.platformCut = _platformCut;
        ci.contestIdType = _contestIdType;
        ci.selectedGames = _selectedGames;
        ci.maxParticipants = _maxParticipants;

        emit EditContest( 
            _contestHash,
            _sender, 
            _entryFee,
            _maxParticipants,
            _contestIdType,
            _platformCut,
            _creatorCut,
            _selectedGames
        );
    }
}