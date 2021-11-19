
// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;


interface IStakingRewardsVault {
    function sendRewards(address _address, uint256 _amount) external;
    function migrateVault(address _address) external;
}