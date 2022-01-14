const { 
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');
  
const { toBN, toWei } = require('web3-utils');
const { balanceSnap } = require('./helpers/balanceSnap')

// EIP712
const ethSign = require('eth-sig-util');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const { getOrderTypedData } = require('./helpers/eip712utils');

const { expect } = require('chai');

const ERC20 = artifacts.require('MockERC20TransferWithSig');
const DFSManager = artifacts.require('ContestManager');
const StakingRewardsVault = artifacts.require('StakingRewardsVault');

contract('DFSManager', function (accounts) {

  const [ owner, someone, anotherone ] = accounts;
  const initialSupply = toBN(1000000);
  
  const ONE_DAY = toBN(60 * 60 * 24);
  const TWO_DAYS = toBN(60 * 60 * 24 * 2);
  const ONE_WEEK = toBN(60 * 60 * 24 * 7);
  
  const cObj = {
    contestType: 0, 
    entryFee: toBN('100'),
    maxParticipants: toBN('100'),
    ownersCut: toBN('2000'), // 20% of entryFee * maxParticipants
    prize: toBN('8000') //80% for pizes
  }

  before(async function () {
    this.reserveToken = await ERC20.new();
    
    // create rewards Vault
    this.rewardsVault = await StakingRewardsVault.new(
      this.reserveToken.address
    );
    
    // create stakingManager
    this.dfsManager = await DFSManager.new(
      this.rewardsVault.address
    );

    // allow dfsManager to call the vault
    await this.rewardsVault.setOperationManager(
      this.dfsManager.address
    );

    // grant owner the CONTEST VALIDATOR role
    const CONTEST_VALIDATOR_ROLE = web3.utils.soliditySha3Raw({ 
      t: "string", 
      v: "CONTEST_VALIDATOR" 
    });

    role = await this.dfsManager.CONTEST_VALIDATOR();
    defaultRole = await this.dfsManager.DEFAULT_ADMIN_ROLE();

    await this.dfsManager.grantRole(
      CONTEST_VALIDATOR_ROLE, owner, 
      {
        from: owner
      }
    )
          
    // mint & approve reserve tokens to someone
    await this.reserveToken.mint(someone, initialSupply);
  })

  describe("createContest", function () {
    it("create contest ERC20 transfer", async function () {

      const nowTs = await time.latest();
      
      /// ERC20.approve() 
      await this.reserveToken.approve(
        this.dfsManager.address,
        cObj.prize, 
        {
          from: someone
        }
      );

      const tx = await this.dfsManager.createContest(
        cObj.contestType,
        true, // guaranteed
        cObj.maxParticipants,
        cObj.entryFee,
        cObj.ownersCut,
        nowTs.add(ONE_DAY), // startTimeStamp
        nowTs.add(ONE_WEEK), // claimableTimeStamp 
        {
          from: someone
        }
      );
      
      expectEvent(tx, 'CreateContest', { 
        'contestId': toBN(0),
        'owner': someone
      });
    });

    it("create contest with EIP712 transfer", async function () {

      const nowTs = await time.latest();
      const someonePK = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
      
      const transferAmount = cObj.prize;

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        transferAmount,  // tokens amount
        this.rewardsVault.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      /// PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(someonePK), { data: typedData }
      );

      // console.log('eip712TransferSignature', eip712TransferSignature);

      const tx = await this.dfsManager.createContestEIP712(
        cObj.contestType,
        false, // guaranteed
        cObj.maxParticipants,
        cObj.entryFee,
        cObj.ownersCut,
        nowTs.add(TWO_DAYS), // startTimeStamp
        nowTs.add(ONE_WEEK), // claimableTimeStamp
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature,
        // 
        {
          from: someone
        }
      );
      
      expectEvent(tx, 'CreateContest', { 
        'contestId': toBN(1),
        'owner': someone
      });
    });
  });

  describe("cancelContest", function () {
    
    it("cancel contest(0):: OK", async function () {
      const userTracker = await balanceSnap(
        this.reserveToken, someone, 'someone\s reserve'
      );
      const platformTracker = await balanceSnap(
        this.reserveToken, owner, 'owner'
      );

      const tx = await this.dfsManager.cancelContest(
        0, { from: someone }
      );
      
      expectEvent(tx, 'CancelContest', { 
        'contestId': toBN(0)
      });

      /// check balances
      await userTracker.requireIncrease(
        toBN('7600'), // refund is 95% of the prize
      ); 

      await platformTracker.requireIncrease(
        toBN('400'), // cancel fee is 5% of the prize
      ); 
    });

    it("fails to cancel :: non owner", async function () {
      await expectRevert(
        this.dfsManager.cancelContest(1, { from: anotherone }), 
        "not contest owner"
      );
    });

    it("fails to cancel :: contest started", async function () {
      await time.increase(TWO_DAYS);
      await expectRevert(
        this.dfsManager.cancelContest(1, { from: someone }),
        "contest started"
      );
    });
  });

  describe("closeContest", function () {

    it("fails close contest(0) :: invalid status", async function () {
      const winnerList = [someone];
      
      await expectRevert(
        this.dfsManager.closeContest(0, winnerList, { 
          from: owner 
        }),
        "contest status invalid"
      );
    });

    it("fails close contest(1) :: not validator role", async function () {
      const winnerList = [someone];

      await expectRevert(
        this.dfsManager.closeContest(1, winnerList, { 
          from: someone 
        }),
        "caller not allowed"
      );
    });

    it("close contest(1) :: refund OK", async function () {
      const winnerList = [someone];

      // TODO: check balances

      this.dfsManager.closeContest(1, winnerList, { 
        from: owner 
      });
    });

    // contest should have participants for these:

    it("fails close contest(1) :: not ended", async function () {
      const winnerList = [someone];

      await expectRevert(
        this.dfsManager.closeContest(1, winnerList, { 
          from: owner 
        }),
        "not ended yet"
      );
    });

    it("fails close contest(1) :: not validator role", async function () {
      const winnerList = [someone];

      await time.increase(ONE_WEEK);

      await expectRevert(
        this.dfsManager.closeContest(1, winnerList, { 
          from: someone 
        }),
        "caller not allowed"
      );
    });

  });
});
