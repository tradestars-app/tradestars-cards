pragma solidity ^0.5.12;

// We import the contract so truffle compiles it, and we have the ABI
// available when working from truffle console.
import "@gnosis.pm/mock-contract/contracts/MockContract.sol";

/// Create Mock ERC20 for test
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {

    function transferWithSig(
        bytes memory,
        uint256 tokenIdOrAmount,
        bytes32,
        uint256,
        address to
    ) public returns (address) {
        _mint(to, tokenIdOrAmount);
    }

    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burnFrom(address account, uint256 value) public {
        _burnFrom(account, value);
    }
}