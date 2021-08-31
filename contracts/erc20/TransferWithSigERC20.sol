// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

import { EIP712Transfer } from "../eip712/EIP712Transfer.sol";
import { ITransferWithSig } from "../eip712/ITransferWithSig.sol";

abstract contract TransferWithSigERC20 is ERC20, EIP712Transfer, ITransferWithSig  {

    using ECDSA for bytes32;

    // eip712 order hashes
    mapping(bytes32 => bool) public disabledHashes;

    /**
     * @dev transfers with owner's signature
     * @param _sig caller's signature
     * @param _amount amount of tokens to transfer
     * @param _data keccak256(abi.encodePacked(_orderId, _tokenAddress, _tokenAmount));
     * @param _expiration order
     * @param _from token owner
     * @param _spender beneficiary
     */
    function transferWithSig(
        bytes calldata _sig,
        uint256 _amount,
        bytes32 _data,
        uint256 _expiration,
        address _from,
        address _spender
    ) 
        external override returns (address from) 
    {
        require(_amount > 0, "transferWithSig(): amount should be > 0");
        require(
            _expiration == 0 || block.number <= _expiration,
            "transferWithSig(): signature is expired"
        );

        bytes32 dataHash = getTokenTransferOrderHash(
            _spender, 
            _from,
            _amount, 
            _data, 
            _expiration
        );
        
        require(
            disabledHashes[dataHash] == false, 
            "transferWithSig(): signature disabled"
        );
        disabledHashes[dataHash] = true;

        from = dataHash.recover(_sig);

        require(from == _from, "transferWithSig(): invalid from");

        // call transfer without approval clearance
        _transfer(from, address(uint160(_spender)), _amount);
    }
}