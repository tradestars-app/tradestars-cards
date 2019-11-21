const { TestHelper } = require('@openzeppelin/cli');
const { Contracts, ZWeb3, assertRevert } = require('@openzeppelin/upgrades');

const { toWei } = require('web3-utils');

ZWeb3.initialize(web3.currentProvider);

console.log('Confirmations', web3.eth.transactionConfirmationBlocks);

require('chai').should();

const BondedERC20 = Contracts.getFromLocal('BondedERC20');

const BondedHelper = Contracts.getFromLocal('BondedERC20Helper');
const FractionableERC721 = Contracts.getFromLocal('FractionableERC721');

/// check events
function checkEventName(tx, eventName) {
  tx.events[eventName].event.should.be.eq(eventName);
}

contract('FractionableERC721', ([_, owner, tokenManager, someone]) => {

  let contract;

  before(async function() {
    const project = await TestHelper();

    /// Create and initialize a fractionableERC721
    const bondedHelper = await BondedHelper.new({ gas: 5000000, from: owner });
    const fractionableERC721 = await FractionableERC721.new({ gas: 5000000, from: owner });

    // Create new PerformanceCard registry
    contract = await project.createProxy(fractionableERC721, {
      initMethod: 'initialize',
      initArgs: [
        owner,
        bondedHelper.address,
        "name",
        "symbol",
        "baseurl"
      ]
    });
  });

  describe('Tests token config calls', function() {

    it(`Should OK setTokenManager()`, async function() {
      await contract.methods.setTokenManager(tokenManager).send({
        from: owner
      })
    });

    it(`Should FAIL setTokenManager() :: not owner`, async function() {
      await assertRevert(
        contract.methods.setTokenManager(tokenManager).send({
          from: someone
        })
      );
    });

    it(`Should OK setBaseTokenUri()`, async function() {
      const newUri = 'https://api.tradestars.app/cards';

      await contract.methods.setBaseTokenUri(newUri).send({
        from: owner
      })

      const uri = await contract.methods.baseTokenUri().call();
      uri.should.be.eq(newUri);
    });

    it(`Should FAIL setBaseTokenUri() :: not owner`, async function() {
      const newUri = 'https://api.tradestars.app/cards';

      await assertRevert(
        contract.methods.setBaseTokenUri(newUri).send({
          from: someone
        })
      );
    });
  });

  describe('Tests Create / Update calls', function() {

    const newToken = {
      tokenId: 1000,
      beneficiary: someone,
      symbol: "symbol",
      name: "name"
    }

    it(`Should OK mintToken()`, async function() {
      const tx = await contract.methods.mintToken(
        newToken['tokenId'],
        newToken['beneficiary'],
        newToken['symbol'],
        newToken['name']
      ).send({
        from: tokenManager,
        gas: 5000000
      });

      checkEventName(tx, 'Transfer');
    });

    it(`Should FAIL mintToken() :: not tokenManager`, async function() {
      await assertRevert(
        contract.methods.mintToken(
          newToken['tokenId'],
          newToken['beneficiary'],
          newToken['symbol'],
          newToken['name']
        ).send({
          from: owner,
          gas: 5000000
        })
      );
    });

    it(`Should OK setBondedTokenReserveRatio()`, async function() {
      const reserveRatio = '222222';

      await contract.methods.setBondedTokenReserveRatio(
        newToken['tokenId'],
        reserveRatio
      ).send({
        from: owner,
        gas: 5000000
      })
    });

    it(`Should FAIL setBondedTokenReserveRatio() :: not owner`, async function() {
      const reserveRatio = '222222';

      await assertRevert(
        contract.methods.setBondedTokenReserveRatio(
          newToken['tokenId'],
          reserveRatio
        ).send({
          from: tokenManager,
          gas: 5000000
        })
      );
    });
  });

  describe('Tests Mint / Burn BondedToken', function() {
    const tokenId = 1000;

    it(`Should OK mintBondedERC20()`, async function() {

      const mintAmount = toWei('100');
      const mintValue = toWei('100');

      const txHash = await new Promise((resolve, reject) => {
        contract.methods.mintBondedERC20(
          tokenId,
          someone,
          mintAmount,
          mintValue
        ).send({
          from: tokenManager,
          gas: 5000000
        })
        .on('transactionHash', (x) => { resolve(x); })
        .catch((err) => { reject(err); })
      });

      await web3.eth.getTransactionReceipt(txHash);

    });

    it(`Should OK BondedERC20 balances == (100)`, async function() {
      const addr = await contract.methods.getBondedERC20(tokenId).call();
      const bondedToken = BondedERC20.at(addr);

      const tSupply = await bondedToken.methods.poolBalance().call();
      const pBalance = await bondedToken.methods.poolBalance().call();

      tSupply.should.be.eq(toWei('100'));
      pBalance.should.be.eq(toWei('100'));
    });

    it(`Should OK burnBondedERC20()`, async function() {

      const burnAmount = toWei('100');
      const burnValue = toWei('100');

      const txHash = await new Promise((resolve, reject) => {
        contract.methods.burnBondedERC20(
          tokenId,
          someone,
          burnAmount,
          burnValue
        ).send({
          from: tokenManager,
          gas: 5000000
        })
        .on('transactionHash', (x) => { resolve(x); })
        .catch((err) => { reject(err); })
      });

      await web3.eth.getTransactionReceipt(txHash);

    });

    it(`Should OK BondedERC20 balances == (0)`, async function() {
      const addr = await contract.methods.getBondedERC20(tokenId).call();
      const bondedToken = BondedERC20.at(addr);

      const tSupply = await bondedToken.methods.poolBalance().call();
      const pBalance = await bondedToken.methods.poolBalance().call();

      tSupply.should.be.eq('0');
      pBalance.should.be.eq('0');
    });

  });


  describe('Tests estimations', function() {
    const tokenId = 1000;

    before(async function() {

      /// Mint Initial amount on tokens / reserve

      const mintAmount = toWei('100');
      const mintValue = toWei('100');

      const txHash = await new Promise((resolve, reject) => {
        contract.methods.mintBondedERC20(
          tokenId,
          someone,
          mintAmount,
          mintValue
        ).send({
          from: tokenManager,
          gas: 5000000
        })
        .on('transactionHash', (x) => { resolve(x); })
        .catch((err) => { reject(err); })
      });

      await web3.eth.getTransactionReceipt(txHash);

      /// set reserve ratio 1/1 for next tests

      const reserveRatio = '1000000';

      await contract.methods.setBondedTokenReserveRatio(
        tokenId,
        reserveRatio
      ).send({
        from: owner,
        gas: 5000000
      });
    });

    it(`Should OK estimateBondedERC20Tokens()`, async function() {
      const value = toWei('100');

      const ret = await contract.methods.estimateBondedERC20Tokens(
        tokenId,
        value
      ).call({
        from: tokenManager
      });

      ret.should.be.equal(value);
    });

    it(`Should OK estimateBondedERC20Value()`, async function() {
      const amount = toWei('100');

      const ret = await contract.methods.estimateBondedERC20Value(
        tokenId,
        amount
      ).call({
        from: tokenManager
      });

      ret.should.be.equal(amount);
    });
  });
});

