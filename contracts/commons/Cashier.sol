// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../eip712/ITransferWithSig.sol";
import "../commons/MetaTransactionsMixin.sol";


contract Cashier is MetaTransactionsMixin, OperationManaged {

    using SafeERC20 for IERC20;

    mapping(address => uint256) private depositBalances;

    // Reserve Token.
    IERC20 public immutable reserveToken;

    /**
     * @dev constructor
     * @param _reserveToken token address  
     */
    constructor(address _reserveToken) {  
        reserveToken = IERC20(_reserveToken);
    }

    /**
     */
    function collectBalance(address _token) external onlyOwner {
        uint256 balance = depositBalances[_token];
        require(balance > 0, "collectBalance(): no balance");

        depositBalances[_token] = 0;

        // Get balance
        _token.safeTransfer(msg.sender, balance);
    }

    /**
     */
    function deposit(
        address _from, 
        address _to,
        address _amountReserve
    ) 
        public payable onlyOperationManager
    {
        depositBalances[address(0)] += msg.value;

        // send reserve
        _reserveToken.safeTransfer(
            _to,
            _amountReserve
        );

        emit Deposit(
            _token, 
            _from, 
            _to, 
            _amountSrc, 
            _amountReserve
        );
    }

    /**
     */
    function deposit(
        address _token, 
        address _from, 
        address _to,
        uint256 _amountSrc,
        uint256 _amountReserve
    ) 
        external override onlyOperationManager
    {
        IERC20(_token).transferFrom(
            _from, address(this), _amountSrc
        );
        
        depositBalances[_token] += _amountSrc;

        // send reserve
        _reserveToken.safeTransfer(
            _to,
            _amountReserve
        );

        emit Deposit(
            _token, 
            _from, 
            _to, 
            _amountSrc, 
            _amountReserve
        );
    }

    /**
     * @dev calls relayed transferWithSig()
     * @param _token allowed depositor
     */
    function transfer(
        address _token, 
        address _from, 
        address _to,
        uint256 _amount,
        // These are required for EIP712
        uint256 _expiration,
        bytes32 _orderId,
        bytes memory _eip712TransferSignature
    ) public {
        // Transfer from sender using EIP712 signature
        ITransferWithSig(_token).transferWithSig(
            _eip712TransferSignature,
            _amount,
            keccak256(
                abi.encodePacked(_orderId, address(_token), _amount)
            ),
            _expiration,
            _from,
            _to
        );   
    }
}
