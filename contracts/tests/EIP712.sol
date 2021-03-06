// SPDX-License-Identifier: MIT

pragma solidity ^0.6.8;

contract LibEIP712Domain {
    string constant internal EIP712_DOMAIN_SCHEMA =
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)";

    bytes32 constant public EIP712_DOMAIN_SCHEMA_HASH = keccak256(
        abi.encodePacked(EIP712_DOMAIN_SCHEMA)
    );

    string constant internal EIP712_DOMAIN_NAME = "Matic Network";
    string constant internal EIP712_DOMAIN_VERSION = "1";
    uint256 constant internal EIP712_DOMAIN_CHAINID = 15001;

    bytes32 public EIP712_DOMAIN_HASH;

    constructor () public {
        EIP712_DOMAIN_HASH = keccak256(
            abi.encode(
                EIP712_DOMAIN_SCHEMA_HASH,
                keccak256(bytes(EIP712_DOMAIN_NAME)),
                keccak256(bytes(EIP712_DOMAIN_VERSION)),
                EIP712_DOMAIN_CHAINID,
                address(this)
            )
        );
    }

    function hashEIP712Message(bytes32 hashStruct) internal view returns (bytes32 result) {
        bytes32 domainHash = EIP712_DOMAIN_HASH;
        assembly {
            // Load free memory pointer
            let memPtr := mload(64)

            mstore(memPtr, 0x1901000000000000000000000000000000000000000000000000000000000000)  // EIP191 header
            mstore(add(memPtr, 2), domainHash)                                                  // EIP712 domain hash
            mstore(add(memPtr, 34), hashStruct)                                                 // Hash of struct

            // Compute hash
            result := keccak256(memPtr, 66)
        }
        return result;
    }
}
