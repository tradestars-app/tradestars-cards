pragma solidity ^0.5.12;

import "../bondedERC20/BondedERC20.sol";

library ERC20Manager {

    function deploy(
        string memory _symbol,
        string memory _name,
        uint256 _tokenId,
        address _owner
    )
        internal returns(address)
    {
        BondedERC20 newContract = new BondedERC20(
            _name,
            _symbol,
            _tokenId,
            _owner
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