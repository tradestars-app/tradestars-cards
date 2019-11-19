pragma solidity ^0.5.12;

import "@openzeppelin/contracts-ethereum-package/contracts/ownership/Ownable.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/cryptography/ECDSA.sol";

contract Administrable is Ownable {
    using ECDSA for bytes32;

    event AdminAdded(address indexed account);
    event AdminRemoved(address indexed account);

    // Admins map
    mapping(address => bool) private adminsMap;

    modifier onlyAdmin {
        require(adminsMap[msg.sender], "sender is not admin");
        _;
    }

    /**
     * @dev Add new admin. Can only be called by owner
     * @param _wallet address of new admin
     */
    function addAdmin(address _wallet) external onlyOwner {
        require(_wallet != address(0), "invalid wallet address");
        require(!isAdmin(_wallet), "wallet already admin");

        adminsMap[_wallet] = true;

        emit AdminAdded(_wallet);
    }

    /**
     * @dev Removes admin account. Can only be called by owner
     * @param _wallet address revoke admin role
     */
    function removeAdmin(address _wallet) external onlyOwner {
        require(_wallet != address(0), "invalid wallet address");
        require(isAdmin(_wallet), "wallet is not admin");

        adminsMap[_wallet] = false;

        emit AdminRemoved(_wallet);
    }

    function renounceAdmin() external onlyAdmin {
        adminsMap[msg.sender] = false;

        emit AdminRemoved(msg.sender);
    }

    // Initializable
    function initialize(address _sender) public initializer {
        Ownable.initialize(_sender);
    }

    /**
     * @dev Check if the provided wallet has an admin role
     * @param _wallet address of wallet to update
     */
    function isAdmin(address _wallet) public view returns (bool) {
        return adminsMap[_wallet];
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function _isValidAdminHash(bytes32 _hash, bytes memory _sig) internal view returns (bool) {
        address signer = _hash.toEthSignedMessageHash().recover(_sig);
        return isAdmin(signer);
    }
}
