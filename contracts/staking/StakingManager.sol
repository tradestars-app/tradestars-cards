// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IStakingRewardsVault.sol";
import "../commons/MetaTransactionsMixin.sol";

import "@openzeppelin/contracts/access/Ownable.sol";

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

/**
 * @dev {StakingManager}:
 */
contract StakingManager is Ownable, MetaTransactionsMixin {

    using SafeERC20 for IERC20;

    // Info for each user.
    struct UserInfo {
        uint256 amount;         // LP token amount the user has provided.
        int256 rewardDebt;      // The amount of TSX entitled to the user.
    }

    // Info of each staking pool.
    struct PoolInfo {
        uint256 relativeWeight;         // Weight of the staking pool.
        uint256 accTSXPerShare;     // Accumulated TSX per share, times 1e18. See below.
        uint256 lastRewardTime;     // Last block ts that TSX distribution occurs
    }

    // Address of Rewards Vault.
    IStakingRewardsVault public rewardsVault;

    // Info of each pool.
    PoolInfo[] public poolInfo;

    // Address of the LP token for each pool.
    IERC20[] public lpToken;

    // Info of each user that stakes LP tokens.
    mapping (uint256 => mapping (address => UserInfo)) public userInfo;

    // Tokens added
    mapping (address => bool) public addedTokens;

    // Total weight. Must be the sum of all relative weight in all pools.
    uint256 public totalWeight;

    uint256 public claimablePerSecond;
    uint256 private constant ACC_TSX_PRECISION = 1e18;

    // Events

    event Stake(
        address indexed user, 
        uint256 indexed pid, 
        uint256 amount
    );
    
    event Unstake(
        address indexed user, 
        uint256 indexed pid, 
        uint256 amount
    );
    
    event EmergencyUnstake(
        address indexed user, 
        uint256 indexed pid, 
        uint256 amount
    );
    
    event Claim(
        address indexed user, 
        uint256 indexed pid, 
        uint256 amount
    );
    
    event LogAddPool(
        uint256 indexed pid, 
        uint256 relativeWeight, 
        address indexed lpToken
    );

    event LogSetPoolWeight(
        uint256 indexed pid, 
        uint256 relativeWeight
    );
    
    event LogUpdatePool(
        uint256 indexed pid, 
        uint256 lastRewardTime, 
        uint256 lpSupply, 
        uint256 accTSXPerShare
    );
    
    event LogClaimablePerSecond(uint256 claimablePerSecond);

    /**
     * @dev constructor
     * @param _rewardsVault reward token address  
     */
    constructor(address _rewardsVault) Ownable() {
        rewardsVault = IStakingRewardsVault(_rewardsVault);
    }

    /**
     * @dev Returns the number of pools.
     */ 
    function poolLength() public view returns (uint256) {
        return poolInfo.length;
    }

    /**
     * @dev Sets RewardVault
     * @param _rewardsVault reward token address  
     */ 
    function setStakingRewardsVault(address _rewardsVault) external onlyOwner {
        rewardsVault = IStakingRewardsVault(_rewardsVault);
    }

    /** 
     * @dev Adds a new LP. Can only be called by the owner.
     *  DO NOT add the same LP token more than once. Rewards will be messed up if you do.
     * @param _relativeWeight amount of TSX to distribute per block.
     * @param _lpToken Address of the LP ERC-20 token.
     */
    function addPool(uint256 _relativeWeight, address _lpToken) external onlyOwner {
        require(
            addedTokens[_lpToken] == false, 
            "StakingManager(): Token already added"
        );
        
        totalWeight += _relativeWeight;
        
        lpToken.push(IERC20(_lpToken));

        poolInfo.push(
            PoolInfo({
                relativeWeight: _relativeWeight,
                lastRewardTime: block.timestamp,
                accTSXPerShare: 0
            })
        );

        addedTokens[_lpToken] = true;
        
        emit LogAddPool(
            lpToken.length - 1, 
            _relativeWeight, 
            _lpToken
        );
    }

    /** 
     * @dev Update the given pool's TSX allocation point.
     *  Can only be called by the owner.
     * @param _pid The index of the pool. See `poolInfo`.
     * @param _relativeWeight New AP of the pool.
     */
    function setPoolWeight(uint256 _pid, uint256 _relativeWeight) external onlyOwner {
        totalWeight -= poolInfo[_pid].relativeWeight;
        totalWeight += _relativeWeight;

        poolInfo[_pid].relativeWeight = _relativeWeight;

        emit LogSetPoolWeight(
            _pid, 
            _relativeWeight
        );
    }

    /** 
     * @dev Sets the tsx per second to be distributed. Can only be called by the owner.
     * @param _claimablePerSecond The amount of TSX to be distributed per second.
     */  
    function setClaimablePerSecond(uint256 _claimablePerSecond) external onlyOwner {
        claimablePerSecond = _claimablePerSecond;
        emit LogClaimablePerSecond(_claimablePerSecond);
    }

    /**
     * @dev Update reward variables of the given pool.
     * @param _pid The index of the pool. See `poolInfo`.
     * @return pool Returns the pool that was updated.
     */
    function updatePool(uint256 _pid) public returns (PoolInfo memory pool) {
        pool = poolInfo[_pid];

        if (block.timestamp <= pool.lastRewardTime) {
            return pool;
        }

        uint256 lpSupply = lpToken[_pid].balanceOf(address(this));
        
        if (lpSupply > 0) {
            uint256 time = block.timestamp - pool.lastRewardTime;
            uint256 tsxReward = time * claimablePerSecond * pool.relativeWeight / totalWeight;

            pool.accTSXPerShare += tsxReward * ACC_TSX_PRECISION / lpSupply;
        }
        
        pool.lastRewardTime = block.timestamp;
        poolInfo[_pid] = pool;
        
        emit LogUpdatePool(
            _pid, 
            pool.lastRewardTime, 
            lpSupply, 
            pool.accTSXPerShare
        );
    }

    /**
     * @dev Update reward variables for all pools. Be careful of gas spending!
     * @param _pids Pool IDs of all to be updated. Make sure to update all active pools.
     */
    function massUpdatePools(uint256[] calldata _pids) external {
        uint256 len = _pids.length;
        
        for (uint256 i = 0; i < len; ++i) {
            updatePool(_pids[i]);
        }
    }

    /** 
     * @dev Stake LP tokens for TSX allocation.
     * @param _pid The index of the pool. See `poolInfo`.
     * @param _amount LP token amount to deposit.
     */
    function stake(uint256 _pid, uint256 _amount) public {
        address senderAddr = msgSender();

        PoolInfo memory pool = updatePool(_pid);
        UserInfo storage user = userInfo[_pid][senderAddr];

        // Effects
        user.amount += _amount;
        user.rewardDebt += int256(_amount * pool.accTSXPerShare / ACC_TSX_PRECISION);

        // Transfer LP tokens
        lpToken[_pid].safeTransferFrom(
            senderAddr, 
            address(this), 
            _amount
        );

        emit Stake(senderAddr, _pid, _amount);
    }

    /** 
     * @dev Unstake LP tokens.
     * @param _pid The index of the pool. See `poolInfo`.
     * @param _amount LP token amount to unstake.
     */
    function unstake(uint256 _pid, uint256 _amount) public {
        address senderAddr = msgSender();

        PoolInfo memory pool = updatePool(_pid);
        UserInfo storage user = userInfo[_pid][senderAddr];
  
        // Effects
        user.rewardDebt -= int256(_amount * pool.accTSXPerShare / ACC_TSX_PRECISION);
        user.amount -= _amount;

        // Unstake LP tokens
        lpToken[_pid].safeTransfer(senderAddr, _amount);

        emit Unstake(senderAddr, _pid, _amount);
    }

    /** 
     * @dev Claim proceeds for transaction sender to `to`.
     * @param _pid The index of the pool. See `poolInfo`.
     */
    function claim(uint256 _pid) public {
        address senderAddr = msgSender();

        PoolInfo memory pool = updatePool(_pid);
        UserInfo storage user = userInfo[_pid][senderAddr];
        
        int256 accumulatedTSX = int256(user.amount * pool.accTSXPerShare / ACC_TSX_PRECISION);
        uint256 pendingTSX = uint256(accumulatedTSX - user.rewardDebt);

        // Effects
        user.rewardDebt = accumulatedTSX;

        // Rewards
        rewardsVault.sendRewards(senderAddr, pendingTSX);

        emit Claim(senderAddr, _pid, pendingTSX);
    }

    /** 
     * @dev Unstake LP tokens and claim proceeds for transaction sender to `to`.
     * @param _pid The index of the pool. See `poolInfo`.
     * @param _amount LP token amount to unstake.
     */
    function unstakeAndClaim(uint256 _pid, uint256 _amount) public {
        address senderAddr = msgSender();

        PoolInfo memory pool = updatePool(_pid);
        UserInfo storage user = userInfo[_pid][senderAddr];
    
        int256 accumulatedTSX = int256(user.amount * pool.accTSXPerShare / ACC_TSX_PRECISION);
        uint256 pendingTSX = uint256(accumulatedTSX - user.rewardDebt);

        // Effects
        user.rewardDebt = accumulatedTSX - int256(_amount * pool.accTSXPerShare / ACC_TSX_PRECISION);
        user.amount -= _amount;

        // Reward
        rewardsVault.sendRewards(senderAddr, pendingTSX);

        // Unstake LP tokens
        lpToken[_pid].safeTransfer(senderAddr, _amount);

        emit Unstake(senderAddr, _pid, _amount);
        emit Claim(senderAddr, _pid, pendingTSX);
    }

    /**
     * @dev Unstake without caring about rewards. EMERGENCY ONLY.
     * @param _pid The index of the pool. See `poolInfo`.
     */ 
    function emergencyUnstake(uint256 _pid) public {
        address senderAddr = msgSender();

        UserInfo storage user = userInfo[_pid][senderAddr];
        uint256 amount = user.amount;

        user.amount = 0;
        user.rewardDebt = 0;

        // Unstake LP tokens
        lpToken[_pid].safeTransfer(senderAddr, amount);

        emit EmergencyUnstake(senderAddr, _pid, amount);
    }

    /** 
     * @dev View function to see pending TSX on frontend.
     * @param _pid The index of the pool. See `poolInfo`.
     * @param _user Address of user.
     * @return pending TSX reward for a given user.
     */
    function pendingRewards(uint256 _pid, address _user) external view returns (uint256) {
        PoolInfo memory pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        
        uint256 accTSXPerShare = pool.accTSXPerShare;
        uint256 lpSupply = lpToken[_pid].balanceOf(address(this));
        
        if (block.timestamp > pool.lastRewardTime && lpSupply != 0) {
            uint256 time = block.timestamp - pool.lastRewardTime;
            uint256 tsxReward = time * claimablePerSecond * pool.relativeWeight / totalWeight;

            accTSXPerShare += tsxReward * ACC_TSX_PRECISION / lpSupply;
        }

        return uint256(
            int256(user.amount * accTSXPerShare / ACC_TSX_PRECISION) - user.rewardDebt
        );
    }
}