// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IStakingRewardsVault.sol";
import "../commons/OperationManaged.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

contract StakingRewardsVault is OperationManaged, IStakingRewardsVault {

    using SafeERC20 for IERC20;

    // Address of rewardToken contract.
    IERC20 public immutable rewardToken;

    constructor(address _rewardToken) {
        rewardToken = IERC20(_rewardToken);
    }
    
    /**
     * @dev sent rewards to wallet. Only called by the operation manager 
     */
    function sendRewards(
        address _wallet, 
        uint256 _amount
    )
        external override onlyOperationManager 
    {
        rewardToken.safeTransfer(_wallet, _amount);
    }

    /**
     * @dev migrate vault to another rewarderVault. Only called by owner
     */
    function migrateVault(address _wallet) external override onlyOwner {
        rewardToken.safeTransfer(
            _wallet, 
            rewardToken.balanceOf(address(this))
        );
    }
}