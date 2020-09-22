// SPDX-License-Identifier: MIT

pragma solidity ^0.6.8;

// This Contract is not upgradable.
import "./IBondedERC20Transfer.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/**
 * @title BondedERC20
 */
contract BondedERC20 is Ownable, ERC20 {

    using SafeMath for uint256;

    uint256 public tokenId;

    // Keeps track of the reserve balance.
    uint256 public poolBalance;

    // Represented in PPM 1-1000000
    uint32 public reserveRatio;

    constructor(
        string memory _name,
        string memory _symbol,
        uint256 _tokenId
    )
        public Ownable() ERC20(_name, _symbol)
    {
        tokenId = _tokenId;

        // sets the reserve ratio for the token
        reserveRatio = 333333;
    }

    /**
     * @dev Sets reserve ratio for the token
     * @param _reserveRatio in PPM 1-1000000
     */
    function setReserveRatio(uint32 _reserveRatio) public onlyOwner {
        require(
            _reserveRatio > 1 && _reserveRatio <= 1000000,
            "BondedERC20: invalid _reserveRatio"
        );

        reserveRatio = _reserveRatio;
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

        // update reserve balance
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

        // update reserve balance
        poolBalance = poolBalance.sub(_value);
    }

    /**
     * @dev Transfer tokens from one address to another
     * @param _from address The address which you want to send tokens from
     * @param _to address The address which you want to transfer to
     * @param _value uint256 the amount of tokens to be transferred
     */
    function transferFrom(address _from, address _to, uint256 _value) public override returns (bool) {
        super.transferFrom(_from, _to, _value);

        // Notify owner NFT transfer.
        IBondedERC20Transfer(owner()).bondedERC20Transfer(
            tokenId,
            _from,
            _to,
            _value
        );

        return true;
    }

    /**
     * @dev transfer token for a specified address
     * @param _to The address to transfer to.
     * @param _value The amount to be transferred.
     */
    function transfer(address _to, uint256 _value) public override returns (bool) {
        super.transfer(_to, _value);

        // Notify owner NFT transfer.
        IBondedERC20Transfer(owner()).bondedERC20Transfer(
            tokenId,
            msg.sender,
            _to,
            _value
        );

        return true;
    }
}
