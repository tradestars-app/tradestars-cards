const { TestHelper } = require('@openzeppelin/cli');
const { Contracts, ZWeb3, assertRevert } = require('@openzeppelin/upgrades');

const { toWei, fromWei } = require('web3-utils');

ZWeb3.initialize(web3.currentProvider);

const TConverter = Contracts.getFromLocal('TConverter');

/// Create a Mock Contract
const ERC20Mock = Contracts.getFromLocal('ERC20Mock');

require('chai').should();

/// check events
function checkEventName(tx, eventName) {
  tx.events[eventName].event.should.be.eq(eventName);
}

contract('TConverter', ([_, owner, allowedCaller, someone]) => {

  let contract;

  let tsToken;
  let reserveToken;

  before(async function() {
    this.project = await TestHelper();

    /// Create Mock ERC20 Contracts
    tsToken = await ERC20Mock.new({ gas: 4000000 });
    reserveToken = await ERC20Mock.new({ gas: 4000000 });

    // Create new PerformanceCard registry
    contract = await this.project.createProxy(TConverter, {
      initMethod: 'initialize',
      initArgs: [ owner ]
    });
  });

  describe('Tests on trade', function() {

    before(async function() {

      // Mint Reserve ERC20 and Reserve Tokens for the converter
      // The ratio would be 12 TSX to 1 reserve (1200 -> 100)
      await reserveToken.methods.mint(contract.address, toWei('100')).send({
        from: owner,
        gas: 6721975,
        gasPrice: 5e9
      });

      await tsToken.methods.mint(contract.address, toWei('1200')).send({
        from: owner,
        gas: 6721975,
        gasPrice: 5e9
      });

    });

    it(`Should OK setAllowedCaller()`, async function() {
      await contract.methods.setAllowedCaller(allowedCaller).send({
        from: owner,
        gas: 6721975
      });
    });

    it(`Should FAIL set setAllowedCaller() :: not owner`, async function() {
      await assertRevert(
        contract.methods.setAllowedCaller(owner).send({
          from: allowedCaller,
          gas: 6721975
        })
      );
    });

    it(`Should OK check getExpectedRate() :: token -> reserve`, async function() {
      const amount = toWei('120');

      const rate = await contract.methods.getExpectedRate(
        tsToken.address,
        reserveToken.address,
        amount
      ).call();

      fromWei(rate).should.be.eq('0.075757575757575757');
    });

    it(`Should OK check getExpectedRate() :: reserve -> token`, async function() {
      const amount = toWei('1');

      const rate = await contract.methods.getExpectedRate(
        reserveToken.address,
        tsToken.address,
        amount
      ).call();

      fromWei(rate).should.be.eq('11.881188118811881188');
    });

    it(`Should OK trade() token -> reserve`, async function() {
      const seller = allowedCaller;
      const amount = toWei('100');

      // mint 100 tsx to seller account.
      await tsToken.methods.mint(seller, amount).send({
        from: seller,
        gas: 6721975,
        gasPrice: 5e9
      });

      /// Increase allowance for trading.
      await tsToken.methods.increaseAllowance(contract.address, amount).send({
        from: seller,
        gas: 6721975,
        gasPrice: 5e9
      });

      const tx = await contract.methods.trade(
        tsToken.address,
        reserveToken.address,
        amount
      ).send({
        from: seller,
        gas: 6721975,
        gasPrice: 5e9
      });

      checkEventName(tx, 'SwapToken');

      const tsBalance = await tsToken.methods.balanceOf(seller).call();
      fromWei(tsBalance).should.be.eq('0');

      const reserveBalance = await reserveToken.methods.balanceOf(seller).call();
      fromWei(reserveBalance).should.be.eq('7.6923076923076923');
    });

    it(`Should FAIL trade() :: not allowed caller`, async function() {
      const seller = allowedCaller;
      const amount = toWei('5');

      /// Increase allowance for trading.
      await reserveToken.methods.increaseAllowance(contract.address, amount).send({
        from: seller,
        gas: 6721975,
        gasPrice: 5e9
      });

      await assertRevert(
        contract.methods.trade(
          tsToken.address,
          reserveToken.address,
          amount
        ).send({
          from: someone,
          gas: 6721975,
          gasPrice: 5e9
        })
      );
    });

    it(`Should FAIL trade() :: allowance`, async function() {
      const seller = allowedCaller;
      const amount = toWei('5');

      await assertRevert(
        contract.methods.trade(
          tsToken.address,
          reserveToken.address,
          amount
        ).send({
          from: seller,
          gas: 6721975,
          gasPrice: 5e9
        })
      );
    });

    it(`Should OK trade() :: reserve -> token`, async function() {
      const seller = allowedCaller;
      const amount = await reserveToken.methods.balanceOf(seller).call();

      /// Increase allowance for trading.
      await reserveToken.methods.increaseAllowance(contract.address, amount).send({
        from: seller,
        gas: 6721975,
        gasPrice: 5e9
      });

      const tx = await contract.methods.trade(
        reserveToken.address,
        tsToken.address,
        amount
      ).send({
        from: seller,
        gas: 6721975,
        gasPrice: 5e9
      });

      checkEventName(tx, 'SwapToken');

      const tsBalance = await tsToken.methods.balanceOf(seller).call();
      fromWei(tsBalance).should.be.eq('99.9999999999999999');

      const reserveBalance = await reserveToken.methods.balanceOf(seller).call();
      fromWei(reserveBalance).should.be.eq('0');
    });

  });
});