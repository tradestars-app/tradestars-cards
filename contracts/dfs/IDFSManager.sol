// SPDX-License-Identifier: MIT
    
pragma solidity ^0.8.0;

import "./IContestStorage.sol";


interface IDFSManager {

    function createContest(
        IContestStorage.ContestInfo memory _contestArgs,
        bytes memory _orderAdminSignature,
        // These are required for EIP712
        uint256 _eip721OrderExpiration,
        bytes32 _eip721OrderId,
        bytes memory _eip712TransferSignature
    ) 
        external;

    function editContest(
        bytes32 _contestHash,
        IContestStorage.ContestInfo memory _contestArgs,
        bytes memory _orderAdminSignature
    ) 
        external;

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
        external;

    function editContestEntry(
        bytes32 _entryHash,
        bytes32 _contestHash,
        bytes memory _draftedPlayers,
        bytes memory _orderAdminSignature
    )
        external;

    function claimContestEntry(
        bytes32[] memory _entryHashArr,
        uint256[] memory _entryAmountArr,
        bytes memory _orderAdminSignature
    )
        external;
}