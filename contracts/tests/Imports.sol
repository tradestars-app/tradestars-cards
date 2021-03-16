// SPDX-License-Identifier: MIT

pragma solidity ^0.6.8;

// We import the contract so truffle compiles it, and we have the ABI
// available when working from truffle console.
import "@gnosis.pm/mock-contract/contracts/MockContract.sol";

/// Create Mock ERC20 for test
import "@openzeppelin/contracts/token/ERC20/ERC20Burnable.sol";
import "./LibTokenTransferOrder.sol";

contract ERC20Mock is ERC20Burnable, LibTokenTransferOrder {

    mapping(bytes32 => bool) public disabledHashes;

    constructor(
        string memory _name,
        string memory _symbol
    )
        ERC20(_name, _symbol) public
    {

    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function ecrecovery(
        bytes32 hash,
        bytes memory sig
    )
        public pure returns (address result)
    {
        bytes32 r;
        bytes32 s;
        uint8 v;

        if (sig.length != 65) {
            return address(0x0);
        }
        assembly {
            r := mload(add(sig, 32))
            s := mload(add(sig, 64))
            v := and(mload(add(sig, 65)), 255)
        }
        // https://github.com/ethereum/go-ethereum/issues/2053
        if (v < 27) {
            v += 27;
        }
        if (v != 27 && v != 28) {
            return address(0x0);
        }

        // get address out of hash and signature
        result = ecrecover(hash, v, r, s);

        // ecrecover returns zero on error
        require(result != address(0x0), "Error in ecrecover");
    }

    function transferWithSig(
        bytes calldata sig,
        uint256 amount,
        bytes32 data,
        uint256 expiration,
        address to
    )
        external returns (address from)
    {
        require(amount > 0, "fail by amount");
        require(expiration == 0 || block.number <= expiration, "Signature is expired");

        bytes32 dataHash = getTokenTransferOrderHash(
            msg.sender,
            amount,
            data,
            expiration
        );
        require(disabledHashes[dataHash] == false, "Sig deactivated");
        disabledHashes[dataHash] = true;

        from = ecrecovery(dataHash, sig);

        _transfer(from, to, amount);
    }
}
