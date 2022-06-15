// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IRewardManager.sol";
import "../commons/OperationManaged.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";


contract RewardManager is OperationManaged, IRewardManager {

    using SafeERC20 for IERC20;

    // entryHash => Info 
    mapping(address => uint256) public balancesHash;

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
     * @dev adds reserve token balance to a beneficiary wallet
     *  caller must be previoulsy approved
     *  
     * @param _beneficiary address  
     * @param _amount reserve token amount
     */
    function addBalance(
        address _beneficiary, 
        uint256 _amount
    )     
        external override
    {   
        // Update balance
        balancesHash[_beneficiary] += _amount; 

        // Transfer reserve tokens
        reserveToken.safeTransferFrom(
            msg.sender, address(this), _amount
        );

        emit AddBalance(msg.sender, _beneficiary, _amount);
    }

    /**
     * @dev spends reserve balance from beneficiary wallet
     *  caller must be previoulsy allowed
     *  
     * @param _beneficiary address  
     * @param _amount reserve token amount
     */
    function spendBalance(
        address _beneficiary, 
        uint256 _amount
    ) 
        external override onlyOperationManager 
    {
        require(
            balancesHash[_beneficiary] >= _amount, 
            "spendBalance: not enougth balance"
        );

        balancesHash[_beneficiary] -= _amount; 

        // Transfer reserve tokens
        reserveToken.safeTransfer(msg.sender, _amount);

        emit SpendBalance(msg.sender, _beneficiary, _amount);
    }
}