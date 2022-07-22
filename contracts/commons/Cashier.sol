// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "../eip712/ITransferWithSig.sol";
import "../commons/MetaTransactionsMixin.sol";

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";


contract Cashier is Ownable, MetaTransactionsMixin {

    using ECDSA for bytes32;
    using SafeERC20 for IERC20;

    // fees collector
    address payable feeCollector;

    // Reserve Token.
    IERC20 public immutable reserveToken;

    // Admin address allowed 
    address private validAdminAddress;

    // Deposit order hashes
    mapping(bytes32 => bool) public disabledHashes;

    event Deposit(
        address token,
        address from,
        address to,
        uint256 srcAmount,
        uint256 reserveAmount
    );

    /**
     * @dev constructor
     * @param _reserveToken token address  
     */
    constructor(
        address _reserveToken
    )
        Ownable() 
    {  
        reserveToken = IERC20(_reserveToken);
    }

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function setAdminAddress(address _newAdmin) external onlyOwner {
        validAdminAddress = _newAdmin;
    }

    /**
     * @dev sets the platforms fee collector
     * @param _feeCollector address
     */
    function setFeeCollector(address payable _feeCollector) external onlyOwner {
        feeCollector = _feeCollector;
    }

    /**
     * @dev Calls a deposit for a token / ether
     * @param _token used for payment
     * @param _from depositor addr
     * @param _to wallet addr where reserve funds are sent
     * @param _amountSrc amount of src token of the order
     * @param _amountReserve amount in reserve for xchange
     * @param _orderExpiration expiration of the order 
     * @param _orderAdminSignature admin signature for this order
     */
    function deposit(
        address _token, 
        address _from, 
        address _to,
        uint256 _amountSrc,
        uint256 _amountReserve,
        uint256 _orderExpiration,
        bytes memory _orderAdminSignature
    ) 
        external payable
    {
        require(
            block.number <= _orderExpiration,
            "deposit(): signature is expired"
        );

        // Check hashed message & admin signature for the new contest
        bytes32 orderHash = keccak256(
            abi.encodePacked(
                _token,
                _amountSrc,
                _amountReserve,
                _orderExpiration,
                // 
                block.chainid, 
                address(this)
            )
        );

        // check unused signature
        require(
            disabledHashes[orderHash] == false, 
            "deposit(): signature disabled"
        );

        disabledHashes[orderHash] = true;
        
        // Check valid & admin approved
        require(
            _isValidAdminHash(orderHash, _orderAdminSignature),
            "deposit() - invalid admin signature"
        );

        // require feeCollector
        require(
            address(feeCollector) != address(0), 
            "deposit - feeCollector not available"
        );

        if (_token == address(0)) {
            feeCollector.transfer(msg.value);

        } else {
            // cashier must be previoulsy approved spender
            IERC20(_token).transferFrom(
                _from, feeCollector, _amountSrc
            );
        }

        // send reserve
        reserveToken.safeTransfer(
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

    /**
     * @dev Check if provided provided message hash and signature are OK
     */
    function _isValidAdminHash(bytes32 _hash, bytes memory _sig) private view returns (bool) {
        return validAdminAddress == _hash.toEthSignedMessageHash().recover(_sig);
    }
}
