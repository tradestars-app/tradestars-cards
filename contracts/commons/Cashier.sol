// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../eip712/ITransferWithSig.sol";
import "../commons/MetaTransactionsMixin.sol";


contract Cashier is MetaTransactionsMixin {

    /**
     * @dev calls relayed transferWithSig()
     * @param _token allowed depositor
     */
    function transfer(
        address _token, 
        address _from, 
        address _to,
        uint256 _amount,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    ) public {
        // Transfer from sender using EIP712 signature
        ITransferWithSig(_token).transferWithSig(
            _eip712TransferSignature,
            _amount,
            keccak256(
                abi.encodePacked(_orderId, address(_token), _amount)
            ),
            _expiration,
            _from,
            _to
        );   
    }
}
