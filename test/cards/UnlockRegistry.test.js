const {
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers')
  
const { toBN, toWei, fromWei, soliditySha3 } = require('web3-utils');

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

/// Used artifacts
const UnlockRegistry = artifacts.require('UnlockRegistry');

describe('UnlockRegistry', function () {

  let owner, someone, anotherone, tokenManager;

  before(async function() {

    [ owner, someone, anotherone, tokenManager ] = await web3.eth.getAccounts();

    /// Create and initialize a UnlockRegistry
    this.contract = await UnlockRegistry.new({ from: owner });
  });

  describe('Setting TokenManager', function() {

    it(`Is set OK`, async function() {
      await this.contract.setOperationManager(tokenManager, {
        from: owner
      })
    });

    it(`Fail to set :: not owner`, async function() {
      await expectRevert(
        this.contract.setOperationManager(tokenManager, {
          from: someone
        }),
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('Test caller for adding contributions', function() {

    const tokenId = 1000;
    const originalAmount = toWei('200', "ether");
    const tokenMaxAmount = toWei('2000', "ether");

    const updatedAmount = toWei('10', 'ether');

    it(`Adds contribution for someone OK`, async function() {
      await this.contract.addContribution(tokenId, someone, originalAmount, tokenMaxAmount, {
        from: tokenManager
      });
    });

    it(`Fails to add contribution :: not tokenManager`, async function() {
      await expectRevert(
        this.contract.addContribution(tokenId, someone, originalAmount, tokenMaxAmount, { 
          from: someone
        }),
        'caller is not allowed'
      );
    });

    it(`Calls clearContributions OK`, async function() {
      const tokenIdToClear = '1111';
      
      await this.contract.clearContributorsFor(tokenIdToClear, {
        from: tokenManager
      })
    });

    it(`Calls clearContributions fail`, async function() {
      const tokenIdToClear = '1111';

      await expectRevert(
        this.contract.clearContributorsFor(tokenIdToClear, {
          from: someone
        }),
        'caller is not allowed'
      );
    });

    it(`Check contribution from someone OK`, async function() {
      const contribution = await this.contract.getSenderContributionFor(someone, tokenId);
      
      // TODO: Change
      expect(contribution).to.be.eq.BN(originalAmount);
    });

    it(`Check refund in new contribution from someone OK`, async function() {      
      const tx = await this.contract.addContribution(
        tokenId, someone, updatedAmount, tokenMaxAmount, { from: tokenManager }
      );

      const contribution = await this.contract.getSenderContributionFor(someone, tokenId);

      expect(contribution).to.be.eq.BN(updatedAmount);
      expectEvent(tx, 'LiquidityContribution', { 
        'from': someone,
        'amount': updatedAmount
      });
    });

    it(`Check multiple contributions OK`, async function() {
      const tx = await this.contract.addContribution(
        tokenId, anotherone, originalAmount, tokenMaxAmount, { from: tokenManager }
      );

      expectEvent(tx, 'LiquidityContribution', { 
        'from': anotherone,
        'amount': originalAmount
      });

      const contributorsArr = await this.contract.getContributorsFor(tokenId);
      
      const someoneContrib = await this.contract.getSenderContributionFor(someone, tokenId);
      const anotherOneContrib = await this.contract.getSenderContributionFor(anotherone, tokenId);
      
      expect(someoneContrib).to.be.eq.BN(updatedAmount);
      expect(anotherOneContrib).to.be.eq.BN(originalAmount);
      expect(contributorsArr).to.have.members([someone, anotherone]);
    });
  });
});
  