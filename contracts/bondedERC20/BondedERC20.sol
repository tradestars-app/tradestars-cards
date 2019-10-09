pragma solidity ^0.5.8;

/// This is not upgradable.
import "./IBondedERC20Transfer.sol";
import "@openzeppelin/contracts-ethereum-package/contracts/token/ERC20/ERC20.sol";

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
     * @param _to beneficiary address of the tokens
     * @param _amount of tokens to mint
     * @param _value value in reserve of the minted tokens
     */
    function mint(address _to, uint256 _amount, uint256 _value) public onlyOwner {
        _mint(_to, _amount);

        /// update reserve balance
        poolBalance = poolBalance.add(_value);
    }

    /**
     * @dev Burns an amount of tokens quivalent to a value reserve.
     *  Can only be called by the owner of the contract
     * @param _burner address
     * @param _amount of tokens to burn
     * @param _value value in reserve of the burned tokens
     */
    function burn(address _burner, uint256 _amount, uint256 _value) public onlyOwner {
        _burn(_burner, _amount);

        /// update reserve balance
        poolBalance = poolBalance.sub(_value);
    }

    /**
     * @dev Transfer tokens from one address to another
     * @param _from address The address which you want to send tokens from
     * @param _to address The address which you want to transfer to
     * @param _value uint256 the amount of tokens to be transferred
     */
    function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
        super.transferFrom(_from, _to, _value);

        // Notify owner NFT transfer.
        owner.bondedERC20Transfer(tokenId, _from, _to, _value);

        return true;
    }

    /**
     * @dev transfer token for a specified address
     * @param _to The address to transfer to.
     * @param _value The amount to be transferred.
     */
    function transfer(address _to, uint256 _value) public returns (bool) {
        super.transfer(_to, _value);

        /// Notify owner NFT transfer.
        owner.bondedERC20Transfer(tokenId, msg.sender, _to, _value);

        return true;
    }
}