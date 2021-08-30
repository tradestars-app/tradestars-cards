// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./ContextMixin.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


contract MetaTransactionsMixin is ContextMixin {
    
    using ECDSA for bytes32;

    // Relayed signatures map
    mapping(bytes => bool) private relayedSignatures;

    /**
     * @dev Executes a transaction that was relayed by a 3rd party
     * @param _nonce tx nonce
     * @param _signer signer who's the original beneficiary
     * @param _abiEncoded function signature
     * @param _orderHashSignature keccak256(nonce, signer, function)
     */
    function executeRelayedTx(
        uint256 _nonce,
        address _signer,
        bytes calldata _abiEncoded,
        bytes calldata _orderHashSignature
    )
        external returns (bytes memory)
    {
        require(
            relayedSignatures[_orderHashSignature] == false,
            "executeRelayedTx(): Invalid _orderSignature"
        );

        // Check hashed message & signature
        bytes32 _hash = keccak256(
            abi.encodePacked(_nonce, _signer, _abiEncoded, block.chainid)
        );

        require(
            _signer == _hash.toEthSignedMessageHash().recover(_orderHashSignature),
            "executeRelayedTx(): invalid signature verification"
        );

        relayedSignatures[_orderHashSignature] = true;

        // Append signer address at the end to extract it from calling context
        (bool success, bytes memory returndata) = address(this).call(
            abi.encodePacked(_abiEncoded, _signer)
        );

        if (success) {
            return returndata;
        }

        // Look for revert reason and bubble it up if present
        if (returndata.length > 0) {

            // solhint-disable-next-line no-inline-assembly
            assembly {
                let returndata_size := mload(returndata)
                revert(add(32, returndata), returndata_size)
            }

        } else {
            revert("executeRelayedTx(): error in call()");
        }
    }
}