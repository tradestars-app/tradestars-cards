// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IDFSManager.sol";
import "./IRewardManager.sol";
import "./IContestStorage.sol";

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

    // PLATFORM & CREATOR'S CUT
    uint256 public constant CREATOR_CUT = 1000; // 10%
    uint256 public constant PLATFORM_CUT = 500; // 5%

    // Reserve Token.
    IERC20 public immutable reserveToken;

    // fees collector
    address public feeCollector;

    // Admin address allowed 
    address private validAdminAddress;

    // Contest storage contract
    IContestStorage private contestStorage;

    // IRewardManager contract
    IRewardManager private rewardManager;

    /**
     * @dev constructor
     * @param _reserveToken token address  
     * @param _contestStorage contest storage contract
     */
    constructor(
        address _reserveToken,
        address _contestStorage
    ) 
        Ownable() 
    {  
        reserveToken = IERC20(_reserveToken);
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
     * @dev sets the rewards manager contract
     * @param _rewardManager address
     */
    function setRewardManager(address _rewardManager) external onlyOwner {
        rewardManager = IRewardManager(_rewardManager);
    }

    /**
     * @dev Creates a contest
     * @param _contestArgs contest arguments
     * @param _orderAdminSignature admin signature validating the entry
     * @param _eip721OrderExpiration for EIP712 order call
     * @param _eip721OrderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function createContest(
        IContestStorage.ContestInfo memory _contestArgs,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _eip721OrderExpiration,
        bytes32 _eip721OrderId,
        bytes memory _eip712TransferSignature
    ) 
        external override
    {        
        address sender = msgSender();

        // Check hashed message & admin signature for the new contest
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                _contestArgs.entryFee,
                _contestArgs.startTime,
                _contestArgs.endTime,
                _contestArgs.isGuaranteed,
                _contestArgs.selectedGames,
                _contestArgs.contestIdType,
                _contestArgs.maxParticipants,
                _contestArgs.maxDraftsPerParticipant,
                // 
                block.chainid, 
                address(this)
            )
        );
        
        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "createContest() - invalid admin signature"
        );

        /// 
        uint256 platformCut = 
            _contestArgs.entryFee * 
            _contestArgs.maxParticipants * PLATFORM_CUT / MATH_PRECISION;

        uint256 creationFee = platformCut;

        /// if the contest is guaranteed, 
        /// creationFee must cover prize + platform fee
        if (_contestArgs.isGuaranteed) {
            creationFee = 
                _contestArgs.entryFee * 
                _contestArgs.maxParticipants * 
                (MATH_PRECISION - CREATOR_CUT) / MATH_PRECISION;
        }

        // create EIP712 transfer order
        bytes32 eipTransferOrderHash = keccak256(
            abi.encodePacked(
                _eip721OrderId, 
                address(reserveToken), 
                creationFee
            )
        );

        // Transfer creationFee from sender using EIP712 signature
        ITransferWithSig(address(reserveToken)).transferWithSig(
            _eip712TransferSignature,
            creationFee,            // amount
            eipTransferOrderHash,
            _eip721OrderExpiration,
            sender,                 // from
            address(this)           // to
        );

        // create contest. Checks contest related constraints
        contestStorage.createContest(sender, _contestArgs);

        // Send platform creation fee to collector
        reserveToken.safeTransfer(
            feeCollector, 
            platformCut
        );
    }

    /**
     * @dev Edits a contest. Admins signature validates contest arguments
     *
     * @param _contestHash of the editable contest
     * @param _contestArgs of the editable contest args
     * @param _orderAdminSignature admin signature validating the edit
     */
    function editContest(
        bytes32 _contestHash,
        IContestStorage.ContestInfo memory _contestArgs,
        bytes memory _orderAdminSignature
    ) 
        external override
    {
        address sender = msgSender();

        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                _contestArgs.startTime,
                _contestArgs.endTime,
                _contestArgs.selectedGames,
                _contestArgs.contestIdType,
                //
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
            _contestArgs
        );
    }

    /**
     * @dev Create contest entry. Admin signature confirms 
     *  drafted players are valid for the contest hash
     *
     * @param _maxPayableFee that covers the entry fee from user's wallet
     * @param _contestHash for the entry
     * @param _draftedPlayers a concat string of the drafted players
     * @param _orderAdminSignature admin signature validating the entry
     * @param _eip721OrderExpiration for EIP712 order call
     * @param _eip721OrderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function createContestEntry(
        uint256 _maxPayableFee,
        bytes32 _contestHash,
        bytes memory _draftedPlayers,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _eip721OrderExpiration,
        bytes32 _eip721OrderId,
        bytes memory _eip712TransferSignature
    )
        external override
    {
        address sender = msgSender();

        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                _contestHash, 
                _draftedPlayers,
                //
                block.chainid, 
                address(this)
            )
        );

        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "createContestEntry() - invalid admin signature"
        );

        // create EIP712 transfer order
        bytes32 eipTransferOrderHash = keccak256(
            abi.encodePacked(
                _eip721OrderId, 
                address(reserveToken), 
                _maxPayableFee
            )
        );

        // Transfer TSX contestEntryFee from sender using EIP712 signature
        ITransferWithSig(address(reserveToken)).transferWithSig(
            _eip712TransferSignature,
            _maxPayableFee,             // amount
            eipTransferOrderHash,
            _eip721OrderExpiration,
            sender,                     // from
            address(this)               // to
        );

        // get contest reference
        (address creator, uint256 entryFee) = contestStorage.getContestData(
            _contestHash
        );

        // check fee or available rewards balance for entry
        if ((_maxPayableFee < entryFee) && (address(rewardManager) != address(0))) {    
            // get balance to complete entry fee or fail
            rewardManager.spendBalance(
                sender, 
                entryFee - _maxPayableFee
            );
        }

        // Creates new entry in storage
        contestStorage.addEntry(
            sender,
            _contestHash, 
            _draftedPlayers
        );

        // Send creator cut fees
        reserveToken.safeTransfer(
            creator, 
            entryFee * CREATOR_CUT / MATH_PRECISION
        );
    }

    /**
     * @dev Edits a contest entry
     * @param _entryHash of the entry
     * @param _contestHash for where the entry is valid
     * @param _draftedPlayers a concat string of the drafted players
     * @param _orderAdminSignature admin signature validating the edit
     */
    function editContestEntry(
        bytes32 _entryHash,
        bytes32 _contestHash,
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
                _contestHash,
                _draftedPlayers, 
                //
                block.chainid, 
                address(this)
            )
        );

        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "editContestEntry() - invalid admin signature"
        );

        // edit the entry
        contestStorage.editEntry(
            sender,
            _entryHash, 
            _contestHash, 
            _draftedPlayers
        );
    }

    /**
     * @dev Claim contest reward
     * @param _entryHashArr array of valid entry hashes to claim prizes from
     * @param _entryAmountArr array of valid amounts to claim prizes
     * @param _orderAdminSignature admin signature validating the claim action
     */
    function claimContestEntry(
        bytes32[] memory _entryHashArr,
        uint256[] memory _entryAmountArr,
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
                _entryHashArr,
                _entryAmountArr,
                //
                block.chainid, 
                address(this)
            )
        );

        // check admin hash on this order
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "claimReward() - invalid admin signature"
        );

        uint256 totalAmount = 0;

        // claim entries for sender on the storage
        for (uint256 idx = 0; idx < _entryHashArr.length; idx++) {
            contestStorage.claimEntry(
                sender, 
                _entryHashArr[idx]
            );
            totalAmount = totalAmount + _entryAmountArr[idx];
        }
        
        // send rewards to user addr
        reserveToken.transfer(sender, totalAmount);
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function _isValidAdminHash(bytes32 _hash, bytes memory _sig) private view returns (bool) {
        return validAdminAddress == _hash.toEthSignedMessageHash().recover(_sig);
    }
}