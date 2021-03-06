// SPDX-License-Identifier: MIT

pragma solidity ^0.6.8;

import "../bondedERC20/BondedERC20.sol";

/// All methods are internal. Implemented throught a JUMP call on the EVM.
library ERC20Manager {

    function deploy(
        string memory _name,
        string memory _symbol,
        uint256 _tokenId
    )
        internal returns(address)
    {
        BondedERC20 newContract = new BondedERC20(
            _name,
            _symbol,
            _tokenId
        );

        return address(newContract);
    }

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

    function setReserveRatio(address _token, uint32 _reserveRatio) internal {
        return BondedERC20(_token).setReserveRatio(_reserveRatio);
    }

    function totalSupply(address _token) internal view returns (uint256) {
        return BondedERC20(_token).totalSupply();
    }

    function poolBalance(address _token) internal view returns (uint256) {
        return BondedERC20(_token).poolBalance();
    }

    function reserveRatio(address _token) internal view returns (uint32) {
        return BondedERC20(_token).reserveRatio();
    }
}
