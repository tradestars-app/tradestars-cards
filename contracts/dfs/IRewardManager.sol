// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IRewardManager {
    
    event AddBalance(
        address caller, 
        address beneficiary,
        uint256 amount
    );
    
    event SpendBalance(
        address caller, 
        address beneficiary, 
        uint256 amount
    );

    function addBalance(
        address _beneficiary, 
        uint256 _amount
    )     
        external;

    function spendBalance(
        address _beneficiary, 
        uint256 _amount
    ) 
        external;
}
