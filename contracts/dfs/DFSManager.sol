// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IDFSManager.sol";
import "./IContestStorage.sol";
import "./IEntryStorage.sol";

import "../staking/IStakingRewardsVault.sol";

import "../eip712/ITransferWithSig.sol";
import "../commons/MetaTransactionsMixin.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";

import "hardhat/console.sol";

/**
 * @dev {ContestManager}:
 */
contract DFSManager is Ownable, IDFSManager, MetaTransactionsMixin {
    
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;
    
    // .0001 precision.
    uint32 public constant MATH_PRECISION = 1e4;

    // Reserve Token.
    IERC20 public immutable reserveToken;

    // fees collector
    address public feeCollector;

    // Admin address allowed 
    address private validAdminAddress;

    // Entry storage contract
    IEntryStorage private entryStorage;

    // Contest storage contract
    IContestStorage private contestStorage;

    /**
     * @dev constructor
     * @param _reserveToken token address  
     * @param _entryStorage entry storage contract
     * @param _contestStorage contest storage contract
     */
    constructor(
        address _reserveToken,
        address _entryStorage,
        address _contestStorage
    ) 
        Ownable() 
    {  
        reserveToken = IERC20(_reserveToken);
        entryStorage = IEntryStorage(_entryStorage);
        contestStorage = IContestStorage(_contestStorage);
    }

    /**
     * @dev Migrate vault in case we want to upgrade the logic
     *  can only be called by the owner of the contract
     * @param _newDFSManager - new DFSManager contract
     */
    function migrateReserve(address _newDFSManager) external onlyOwner {
        reserveToken.safeTransfer(
            _newDFSManager, 
            reserveToken.balanceOf(address(this))
        );
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function setAdminAddress(address _newAdmin) external onlyOwner {
        validAdminAddress = _newAdmin;
    }

    /**
     * @dev sets the platforms fee collector
     * @param _feeCollector address
     */
    function setFeeCollector(address _feeCollector) external onlyOwner {
        feeCollector = _feeCollector;
    }

    /**
     * @dev Creates a contest
     * @param _creationFee fee for contest create
     * @param _entryFee to create a contest entry
     * @param _selectedGames a concat string of the drafted players
     * @param _maxParticipants a concat string of the drafted players
     * @param _contestIdType uint specifing contest type
     * @param _platformCut percentage of the entry fee that goes to platform
     * @param _creatorCut percentage of the entry fee that goes to creator
     * @param _orderAdminSignature admin signature validating the entry
     * @param _expiration for EIP712 order call
     * @param _orderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function createContest(
        uint256 _creationFee,
        uint256 _entryFee,
        bytes memory _selectedGames,
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    ) 
        public override
    {
        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            // NOTE: using encode vs encodePacked, check client hashing algo
            abi.encodePacked(
                msgSender(), 
                _creationFee,
                _entryFee,
                _selectedGames,
                _maxParticipants,
                _contestIdType,
                _platformCut,
                _creatorCut,
                block.chainid, 
                address(this)
            )
        );
        
        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "createEntry() - invalid admin signature"
        );

        // NOTE: using encode vs encodePacked, check client hashing algo
        bytes32 eipTransferHash = keccak256(
            abi.encodePacked(_orderId, address(reserveToken), _creationFee)
        );

        // Transfer TSX _entryFee from sender using EIP712 signature
        ITransferWithSig(address(reserveToken)).transferWithSig(
            _eip712TransferSignature,
            _creationFee,
            eipTransferHash,
            _expiration,
            msgSender(),    // from
            address(this)   // to
        );

        // create contest
        contestStorage.createContest(
            msgSender(), 
            _selectedGames,
            _entryFee,
            _maxParticipants,
            _contestIdType,
            _platformCut, 
            _creatorCut
        );

        // Send creator fee 
        reserveToken.safeTransfer(feeCollector, _creationFee);
    }

    /**
     * @dev Edits a contest. Admins signature validades, 
     *   contestType, entryFee, selectedGames and cuts 
     *
     * @param _contestHash of the editable contest
     * @param _selectedGames selected games
     * @param _entryFee fee for contest create
     * @param _maxParticipants allowed on the contest 
     * @param _contestIdType contest type
     * @param _platformCut platform cut
     * @param _creatorCut creator cut
     * @param _orderAdminSignature admin signature validating the edit
     */
    function editContest(
        bytes32 _contestHash,
        bytes memory _selectedGames,
        uint256 _entryFee,
        uint32 _maxParticipants,
        uint8 _contestIdType,
        uint8 _platformCut,
        uint8 _creatorCut,
        bytes memory _orderAdminSignature
    ) 
        external override
    {
        address sender = msgSender();

        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            // NOTE: using encode vs encodePacked, check client hashing algo
            abi.encodePacked(
                sender,
                _contestHash,
                _selectedGames,
                _entryFee,
                _maxParticipants,
                _contestIdType,
                _platformCut,
                _creatorCut, 
                block.chainid, 
                address(this)
            )
        );

        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "editContestEntry() - invalid admin signature"
        );

        contestStorage.editContest(
            sender, 
            _contestHash,
            _selectedGames,
            _entryFee,
            _maxParticipants,
            _contestIdType,
            _platformCut,
            _creatorCut
        );
    }

    /**
     * @dev Create contest entry
     * @param _contestHash for the entry
     * @param _entryFee contribution fee for entering the contest
     * @param _draftedPlayers a concat string of the drafted players
     * @param _orderAdminSignature admin signature validating the entry
     * @param _expiration for EIP712 order call
     * @param _orderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function createContestEntry(
        bytes32 _contestHash,
        uint256 _entryFee,
        bytes memory _draftedPlayers,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    )
        external override
    {
        address sender = msgSender();

        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            // NOTE: using encode vs encodePacked, check client hashing algo
            abi.encodePacked(
                sender,
                _contestHash, 
                _entryFee,
                _draftedPlayers,
                block.chainid, 
                address(this)
            )
        );

        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "createEntry() - invalid admin signature"
        );

        // Transfer TSX _entryFee from sender using EIP712 signature
        ITransferWithSig(address(reserveToken)).transferWithSig(
            _eip712TransferSignature,
            _entryFee,
            keccak256(
                // NOTE: using encode vs encodePacked, check client hashing algo
                abi.encodePacked(_orderId, address(reserveToken), _entryFee)
            ),
            _expiration,
            sender,         // from
            address(this)   // to
        );

        // associate entry 
        IContestStorage.ContestInfo memory ci = contestStorage.getContestByHash(_contestHash);

        require(
            _entryFee == ci.entryFee,
            "createEntry() - entry fee mismatch"
        );

        // Calc fees
        uint256 creatorCut = (ci.entryFee * ci.creatorCut) / MATH_PRECISION;
        uint256 platformCut = (ci.entryFee * ci.platformCut) / MATH_PRECISION;

        // Send creator / platform fees
        reserveToken.safeTransfer(ci.creator, creatorCut);
        reserveToken.safeTransfer(feeCollector, platformCut);

        // create the entry
        entryStorage.createEntry(sender, _contestHash, _draftedPlayers);
        
        // increase the participants counter
        ci.participantsCount += 1;
    }

    /**
     * @dev Edits a contest entry
     * @param _entryHash for the entry
     * @param _draftedPlayers a concat string of the drafted players
     * @param _orderAdminSignature admin signature validating the edit
     */
    function editContestEntry(
        bytes32 _entryHash,
        bytes memory _draftedPlayers,
        bytes memory _orderAdminSignature
    )
        external override
    {
        address sender = msgSender();

        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            // NOTE: using encode vs encodePacked, check client hashing algo
            abi.encodePacked(
                sender,
                _entryHash,
                _draftedPlayers, 
                block.chainid, 
                address(this)
            )
        );

        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "editContestEntry() - invalid admin signature"
        );

        // create the entry
        entryStorage.editEntry(sender, _entryHash, _draftedPlayers);
    }

    /**
     * @dev Claim contest reward
     * @param _claimedAmount total claim amount in reserve tokens
     * @param _entryHashArr array of valid entry hashes to claim prizes from
     * @param _orderAdminSignature admin signature validating the claim action
     */
    function claimContesEntry(
        uint256 _claimedAmount,
        bytes32[] memory _entryHashArr,
        bytes memory _orderAdminSignature
    )
        external override
    {
        address sender = msgSender();

        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            // NOTE: using encode vs encodePacked, check client hashing algo
            abi.encodePacked(
                sender,
                _claimedAmount,
                _entryHashArr, 
                block.chainid, 
                address(this)
            )
        );

        // check admin hash on this order
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "claimReward() - invalid admin signature"
        );

        // claim entries for sender on the storage
        for (uint256 idx = 0; idx < _entryHashArr.length; idx++) {
            entryStorage.claimEntry(sender, _entryHashArr[idx]);
        }
        
        // send rewards to user addr
        reserveToken.transfer(sender, _claimedAmount);
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function _isValidAdminHash(bytes32 _hash, bytes memory _sig) private view returns (bool) {
        return validAdminAddress == _hash.toEthSignedMessageHash().recover(_sig);
    }
}