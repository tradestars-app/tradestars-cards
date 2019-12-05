pragma solidity ^0.5.12;

// We import the contract so truffle compiles it, and we have the ABI
// available when working from truffle console.
import "@gnosis.pm/mock-contract/contracts/MockContract.sol";

/// Create Mock ERC20 for test
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";
import "./LibTokenTransferOrder.sol";

contract ERC20Mock is ERC20, LibTokenTransferOrder {

    mapping(bytes32 => bool) public disabledHashes;

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burnFrom(address account, uint256 value) public {
        _burnFrom(account, value);
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
        _transferFrom(from, address(uint160(to)), amount);
    }

    /// @param from Address from where tokens are withdrawn.
    /// @param to Address to where tokens are sent.
    /// @param value Number of tokens to transfer.
    /// @return Returns success of function call.
    function _transferFrom(address from, address to, uint256 value) internal returns (bool) {
        _transfer(from, to, value);

        return true;
    }
}