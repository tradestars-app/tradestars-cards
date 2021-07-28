// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../bondedERC20/BondedERC20.sol";

/// All methods are internal. Implemented throught a JUMP call on the EVM.
library ERC20Manager {

    /**
     * @dev creates a new BondedERC20
     * @param _name of the contract
     * @param _symbol of the contract
     * @param _tokenId of the contract
     */
    function deploy(
        string memory _name,
        string memory _symbol,
        uint256 _tokenId
    )
        internal returns(address)
    {
        return address(
            new BondedERC20(
                _name,
                _symbol,
                _tokenId
            )
        );
    }

    /**
     * @dev mint proxy method to the BondedERC20
     * @param _token address
     * @param _beneficiary address 
     * @param _amount to mint of the BondedERC20 
     * @param _value value in reserve token
     */
    function mint(
        address _token,
        address _beneficiary,
        uint256 _amount,
        uint256 _value
    )
        internal
    {
        BondedERC20(_token).mint(
            _beneficiary,
            _amount,
            _value
        );
    }

    /**
     * @dev burn proxy method to the BondedERC20
     * @param _token address
     * @param _burner address 
     * @param _amount to burn of the BondedERC20 
     * @param _value value to burn in reserve token
     */
    function burn(
        address _token,
        address _burner,
        uint256 _amount,
        uint256 _value
    )
        internal
    {
        BondedERC20(_token).burn(
            _burner,
            _amount,
            _value
        );
    }

    /**
     * @dev transfer proxy method to the BondedERC20
     * @param _token address
     * @param _to dst address 
     * @param _value BondedERC20 amount 
     */
    function transfer(
        address _token,
        address _to,
        uint256 _value
    ) 
        internal returns (bool)
    {
        return BondedERC20(_token).transfer(
            _to, 
            _value
        );
    }

    /**
     * @dev Set the setReserveRatio of the BondedERC20
     * @param _token address
     * @param _reserveRatio new ration in 1-1000000
     */
    function setReserveRatio(address _token, uint32 _reserveRatio) internal {
        BondedERC20(_token).setReserveRatio(_reserveRatio);
    }

    /**
     * @dev Check totalSupply of the BondedERC20
     * @param _token address
     */
    function totalSupply(address _token) internal view returns (uint256) {
        return BondedERC20(_token).totalSupply();
    }

    /**
     * @dev Check poolBalance of the BondedERC20
     * @param _token address
     */
    function poolBalance(address _token) internal view returns (uint256) {
        return BondedERC20(_token).poolBalance();
    }

    /**
     * @dev Check reserveRatio of the BondedERC20
     * @param _token address
     */
    function reserveRatio(address _token) internal view returns (uint32) {
        return BondedERC20(_token).reserveRatio();
    }
}
