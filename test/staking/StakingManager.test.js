const { 
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const { toBN, toWei } = require('web3-utils');
const { balanceSnap } = require('../helpers/balanceSnap')

const { expect } = require('chai');

const ERC20 = artifacts.require('MockERC20');
const StakingManager = artifacts.require('StakingManager');
const StakingRewardsVault = artifacts.require('StakingRewardsVault');

contract('VestingManager', function (accounts) {

  const [ owner, someone, anotherone ] = accounts;
  const initialSupply = toBN(10000);
  const rewardsPerSecond = toBN(1000);

  beforeEach(async function () {
    this.token = await ERC20.new();
    this.lpToken = await ERC20.new();
    
    // create rewards Vault
    this.rewardsVault = await StakingRewardsVault.new(
      this.token.address
    );
    
    // create stakingManager
    this.stakingManager = await StakingManager.new(
      this.rewardsVault.address
    );

    // allow staking manager to call the vault
    await this.rewardsVault.setOperationManager(
      this.stakingManager.address
    );
    
    // set initial rewards per sec. 
    await this.stakingManager.setClaimablePerSecond(rewardsPerSecond);
    
    // mint & approve lptokens to someone
    await this.lpToken.mint(someone, initialSupply);
    await this.lpToken.approve(
      this.stakingManager.address, 
      initialSupply, 
      { 
        from: someone 
      }
    );
  })

  describe("PoolLength", function () {
    it("PoolLength should execute", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      
      const pl = await this.stakingManager.poolLength();
      expect(pl).to.be.eq.BN(1);
    })
  })

  describe("Test addPool()", function () {
    it("Should addPool() OK", async function () {
      const tx = await this.stakingManager.addPool(10, this.lpToken.address);

      expectEvent(tx, 'LogAddPool', { 
        'pid': toBN(0),
        'relativeWeight': toBN(10), 
        'lpToken': this.lpToken.address,
      });
    })

    it("Should revert if pool already added", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      await expectRevert(
        this.stakingManager.addPool(10, this.lpToken.address),
        'StakingManager(): Token already added'
      );
    })
  });

  describe("Test setPoolWeight()", function () {
    it("Should emit event LogSetPoolWeight", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      const tx = await this.stakingManager.setPoolWeight(0, 100);
      
      expectEvent(tx, 'LogSetPoolWeight', { 
        'pid': toBN(0),
        'relativeWeight': toBN(100), 
      });
    })

    it("Should revert if invalid pool", async function () {
      // reverts by accessing a non-existing array index
      await expectRevert.unspecified(
        this.stakingManager.setPoolWeight(0, 10)
      );
    });
  })

  describe("Test setClaimablePerSecond()", function () {
    it("Should emit LogClaimablePerSecond", async function () {
      const tx = await this.stakingManager.setClaimablePerSecond(10);

      expectEvent(tx, 'LogClaimablePerSecond', { 
        'claimablePerSecond': toBN(10),
      });
    });
  });

  describe("Test pool updates", function () {
    it("Should emit event LogUpdatePool", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      await time.advanceBlock(1);
      
      const tx = await this.stakingManager.updatePool(0);
      
      expectEvent(tx, 'LogUpdatePool', { 
        'pid': toBN(0),
        'lastRewardTime': await time.latest(),
        'lpSupply': toBN(0),
        'accTSXPerShare': toBN(0),
      });
    });

    it("Should call massUpdatePools OK", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      await time.advanceBlock();
      await this.stakingManager.massUpdatePools([0]);
    })

    it("Updating invalid pools should fail", async function () {
      // reverts by accessing a non-existing array index
      await expectRevert.unspecified(
        this.stakingManager.massUpdatePools([0, 10000, 100000])
      );
    })
  })

  describe("Stake", function () {
    it("Staking 0 amount", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      
      const tx = await this.stakingManager.stake(0, 0, { from: someone });
      
      expectEvent(tx, 'Stake', {
        'user': someone,
        'pid': toBN(0),
        'amount': toBN(0),
      });
    })

    it("Staking into non-existent pool should fail", async function () {
      // reverts by accessing a non-existing array index
      await expectRevert.unspecified(
        this.stakingManager.stake(100, 0)
      );
    })
  })

  describe("Unstake", function () {
    it("Unstake 0 amount", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);

      const tx = await this.stakingManager.unstake(0, 0, { from: someone });
      
      expectEvent(tx, 'Unstake', {
        'user': someone,
        'pid': toBN(0),
        'amount': toBN(0),
      });
    })
  })

  describe("Claim", function () {    
    it("Should give back the correct amount of TSX and reward", async function () {

      await this.token.mint(this.rewardsVault.address, toBN(86401000));

      await this.stakingManager.addPool(10, this.lpToken.address);
      await this.stakingManager.stake(0, toBN(100), { from: someone });
      
      const stakeTs = await time.latest();

      await time.increase(86400);
      
      await this.stakingManager.unstake(0, toBN(100), { from: someone });
      
      const unstakeTs = await time.latest();
    
      // check rewards
      const expectedTSX = toBN(rewardsPerSecond).mul(unstakeTs.sub(stakeTs));
      const userInfo = await this.stakingManager.userInfo(0, someone);

      expect(userInfo.rewardDebt).to.be.eq.BN(
        expectedTSX.mul(toBN(-1))
      );
      
      const tx = await this.stakingManager.claim(0, { from: someone });

      expectEvent(tx, 'Claim', {
        'user': someone,
        'pid': toBN(0),
        'amount': expectedTSX,
      });
    });

    it("Claim with empty user balance", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      await this.stakingManager.claim(0, { from: someone });
    })
  })

  describe("EmergencyUnstake", function () {
    it("Should emit event EmergencyUnstake", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      await this.stakingManager.stake(0, toBN(1), { from: someone });

      const tx = await this.stakingManager.emergencyUnstake(0, { from: someone });
      
      expectEvent(tx, 'EmergencyUnstake', {
        'user': someone,
        'pid': toBN(0),
        'amount': toBN(1),
      });
    });
  })

  describe("PendingTSX", function () {
    it("Pending TSX should equal expected TSX", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);

      const tx = await this.stakingManager.stake(0, toBN(1), { 
        from: someone,
      });
      
      await time.increase(86400); // 1 day
      
      // update pool
      const tx2 = await this.stakingManager.updatePool(0, { from: owner });

      const timestamp = (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp;
      const timestamp2 = (await web3.eth.getBlock(tx2.receipt.blockNumber)).timestamp;

      const pendingTSX = await this.stakingManager.pendingRewards(0, someone);
      const expectedTSX = rewardsPerSecond.mul(
        toBN(timestamp2 - timestamp)
      );
      
      expect(pendingTSX).to.be.eq.BN(expectedTSX);
    });

    it("When time is lastRewardTime", async function () {
      await this.stakingManager.addPool(10, this.lpToken.address);
      
      const tx = await this.stakingManager.stake(0, toBN(1), { 
        from: someone,
      });
      
      // await time.advanceBlockTo(58);

      const tx2 = await this.stakingManager.updatePool(0);
  
      const timestamp = (await web3.eth.getBlock(tx.receipt.blockNumber)).timestamp;
      const timestamp2 = (await web3.eth.getBlock(tx2.receipt.blockNumber)).timestamp;
      
      const pendingTSX = await this.stakingManager.pendingRewards(0, someone);
      const expectedTSX = rewardsPerSecond.mul(
        toBN(timestamp2 - timestamp)
      );
      
      expect(pendingTSX).to.be.eq.BN(expectedTSX);
    });

  });
});