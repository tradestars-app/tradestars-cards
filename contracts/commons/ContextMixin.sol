// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


contract ContextMixin {

    /**
     * @dev Returns message sender. If its called from a relayed call it gets
     *  the sender address from last 20 bytes msg.data
     */
    function msgSender() internal view returns (address sender) {
        if (msg.sender == address(this)) {

            bytes memory array = msg.data;
            uint256 index = msg.data.length;

            // Load the 32 bytes word from memory with the address on the lower 20 bytes, and mask those.
            assembly {
                sender := and(
                    mload(add(array, index)), 
                    0xffffffffffffffffffffffffffffffffffffffff
                )
            }
            return sender;
        }
        return msg.sender;
    }
}