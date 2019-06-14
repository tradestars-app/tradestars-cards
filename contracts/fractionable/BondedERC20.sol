pragma solidity ^0.5.0;

import "openzeppelin-eth/contracts/token/ERC20/ERC20.sol";
import "./IBondedERC20Transfer.sol";

/**
 * @title BondedERC20
 */
contract BondedERC20 is ERC20 {

    using SafeMath for uint256;

    IBondedERC20Transfer public owner;

    string public name;
    string public symbol;
    uint8 public decimals = 18;

    uint256 public tokenId;

    /// Initial Pool
    uint256 public poolBalance;

    /// Represented in PPM 1-1000000
    uint32 public reserveRatio = 333333;

    /**
     * @dev Throws if called by any account other than the owner.
     */
    modifier onlyOwner() {
        require(msg.sender == address(owner), "msg.sender is not owner");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _tokenId,
        address _sender
    )
        public
    {
        name = _name;
        symbol = _symbol;
        tokenId = _tokenId;

        owner = IBondedERC20Transfer(_sender);
    }

    /**
     * @dev Issues an amount of tokens quivalent to a value reserve.
     *  Can only be called by the owner of the contract
     * @param to beneficiary address of the tokens
     * @param amount of tokens to mint
     * @param value value in reserve of the minted tokens
     */
    function mint(address to, uint256 amount, uint256 value) public onlyOwner {
        _mint(to, amount);

        /// update reserve balance
        poolBalance = poolBalance.add(value);
    }

    /**
     * @dev Burns an amount of tokens quivalent to a value reserve.
     *  Can only be called by the owner of the contract
     * @param burner address
     * @param amount of tokens to burn
     * @param value value in reserve of the burned tokens
     */
    function burn(address burner, uint256 amount, uint256 value) public onlyOwner {
        _burn(burner, amount);

        /// update reserve balance
        poolBalance = poolBalance.sub(value);
    }

    /**
     * @dev Transfer tokens from one address to another
     * @param from address The address which you want to send tokens from
     * @param to address The address which you want to transfer to
     * @param value uint256 the amount of tokens to be transferred
     */
    function transferFrom(address from, address to, uint256 value) public returns (bool) {
        super.transferFrom(from, to, value);

        // Notify owner NFT transfer.
        owner.bondedERC20Transfer(tokenId, from, to, value);

        return true;
    }

    /**
     * @dev transfer token for a specified address
     * @param to The address to transfer to.
     * @param value The amount to be transferred.
     */
    function transfer(address to, uint256 value) public returns (bool) {
        super.transfer(to, value);

        /// Notify owner NFT transfer.
        owner.bondedERC20Transfer(tokenId, msg.sender, to, value);

        return true;
    }
}