// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IContestManager.sol";

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
contract ContestManager is Ownable, IContestManager, MetaTransactionsMixin {
    
    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // Reserve Token.
    IERC20 public immutable reserveToken;

    // fees collector
    address public feeCollector;

    // entriesSignatures / for entry creation and claim one time only
    mapping(bytes32 => bool) private entriesSignatures;

    // Admin address allowed 
    address private validAdminAddress;

    /**
     * @dev constructor
     * @param _reserveToken token address  
     * @param _feeCollector token address  
     */
    constructor(
        address _reserveToken, 
        address _feeCollector
    ) 
        Ownable() 
    {  
        reserveToken = IERC20(_reserveToken);
        feeCollector = _feeCollector;
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function setAdminAddress(address _newAdmin) external onlyOwner {
        validAdminAddress = _newAdmin;
    }

    /**
     * @dev Create contest entry
     * @param _contestId for the entry
     * @param _entryFee contribution fee for entering the contest
     * @param _draftedPlayersArr for the entry
     * @param _orderAdminSignature admin signature validating the entry
     * @param _expiration for EIP712 order call
     * @param _orderId for EIP712 order call
     * @param _eip712TransferSignature EIP712 transfer signature for reserve token
     */
    function createEntry(
        uint256 _contestId,
        uint256 _entryFee,
        uint8 _draftedPlayersArr,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    )
        external override
    {
        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                _contestId, 
                _entryFee,
                _draftedPlayersArr,
                block.chainid, 
                address(this)
            )
        );
        _checkOrderSignature(_contestId, _entryFee, _orderAdminSignature);

        // Transfer TSX _entryFee from sender using EIP712 signature
        ITransferWithSig(address(reserveToken)).transferWithSig(
            _eip712TransferSignature,
            _entryFee,
            keccak256(
                abi.encodePacked(_orderId, address(reserveToken), _entryFee)
            ),
            _expiration,
            msgSender(),   // from
            address(this)   // to
        );

        /*
         * NOTE: this is informational only in V1, 
         * should be moved to a storage contract to make this 
         * contract upgradeable
         */
        emit Entry(msgSender(), _contestId, _entryFee);
    }

    /**
     * @dev Claim contest reward
     * @param _contestId for the entry
     * @param _rewardAmount _rewardAmount for the entry
     * @param _orderAdminSignature admin signature validating the prize
     */
    function claimReward(
        uint256 _contestId,
        uint256 _rewardAmount,
        bytes memory _orderAdminSignature
    )
        external override
    {
        // Check hashed message & admin signature
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                _contestId, 
                _rewardAmount,
                block.chainid, 
                address(this)
            )
        );

        // check admin hash on this order
        _checkOrderSignature(orderHash, _orderAdminSignature);

        // send rewards to user addr
        reserveToken.transfer(msgSender(), _rewardAmount);

        /*
         * NOTE: this is informational only in V1, 
         * should be moved to a storage contract to make this 
         * contract upgradeable
         */
        emit Claim(msgSender(), _contestId, _rewardAmount);
    }

    /**
     * @dev Checks an order signature
     * @param _orderHash of the order
     * @param _orderAdminSignature admin signature to validate
     */
    function _checkOrderSignature(
        bytes32 _orderHash, 
        bytes memory _orderAdminSignature
    ) 
        private 
    {
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "_checkOrderSignature() - invalid admin signature"
        );

        require(
            entriesSignatures[orderHash] == false, 
            "_checkOrderSignature() - signature already used"
        );

        // mark this signature as used
        entriesSignatures[orderHash] = true;
    }   

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function _isValidAdminHash(bytes32 _hash, bytes memory _sig) private view returns (bool) {
        return validAdminAddress == _hash.toEthSignedMessageHash().recover(_sig);
    }
}