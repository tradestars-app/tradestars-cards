// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface ITransferWithSig {
    function transferWithSig(
        bytes calldata sig,
        uint256 tokenAmount,
        bytes32 data,
        uint256 expiration,
        address from,
        address to
    ) external returns (address);
}