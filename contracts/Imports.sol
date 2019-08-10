pragma solidity ^0.5.8;

// We import the contract so truffle compiles it, and we have the ABI
// available when working from truffle console.
import "@gnosis.pm/mock-contract/contracts/MockContract.sol";

/// Create Mock KyberProxy for test
import "./dex/IKyberNetworkProxy.sol";

contract KyberMock is IKyberNetworkProxy {
    function getExpectedRate(
        IERC20, // _srcToken,
        IERC20, // _destToken,
        uint // _srcAmount
    )
        public view returns (uint expectedRate, uint slippageRate)
    {
        return (1, 1);
    }

    function trade(
        IERC20 _srcToken,
        uint _srcAmount,
        IERC20 _destToken,
        address _destAddress,
        uint, // _maxDestAmount,
        uint, // _minConversionRate,
        address // _walletId
    )
        public payable returns (uint)
    {
        uint ret = _srcAmount / 100;

        _srcToken.transferFrom(msg.sender, address(this), _srcAmount);
        _destToken.transfer(_destAddress, ret);

        return ret;
    }
}

/// Create Mock ERC20 for test
import "openzeppelin-eth/contracts/token/ERC20/ERC20.sol";

contract ERC20Mock is ERC20 {
    function mint(address to, uint256 amount) public {
        _mint(to, amount);
    }

    function burnFrom(address account, uint256 value) public {
        _burnFrom(account, value);
    }
}