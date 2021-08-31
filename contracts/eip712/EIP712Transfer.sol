    
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import { EIP712Base } from "./EIP712Base.sol";


contract EIP712Transfer is EIP712Base {

    struct TokenTransferOrder {
        address spender;
        address from;
        uint256 tokenAmount;
        bytes32 data;
        uint256 expiration;
    }

    bytes32 private constant TRANSFER_TYPEHASH = keccak256(
        "TokenTransferOrder(address spender,address from,uint256 tokenAmount,bytes32 data,uint256 expiration)"
    );

    function getTokenTransferOrderHash(
        address _spender,
        address _from,
        uint256 _tokenAmount,
        bytes32 _data,
        uint256 _expiration
    )
        public view returns (bytes32 orderHash)
    {
        orderHash = toTypedMessageHash(
            hashTransferOrder(
                _spender, 
                _from,
                _tokenAmount, 
                _data, 
                _expiration
            )
        );
    }

    function hashTransferOrder(
        address _spender,
        address _from,
        uint256 _tokenAmount,
        bytes32 _data,
        uint256 _expiration
    )
        private
        pure
        returns (bytes32)
    {
        return keccak256(
            abi.encode(
                TRANSFER_TYPEHASH,
                _spender,
                _from,
                _tokenAmount,
                _data,
                _expiration
            )
        );
    }
}