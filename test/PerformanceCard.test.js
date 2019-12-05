const { TestHelper } = require('@openzeppelin/cli');
const { Contracts, ZWeb3, assertRevert } = require('@openzeppelin/upgrades');

const { toWei, soliditySha3 } = require('web3-utils');

/// Used in EIP712
const ethSign = require('eth-sig-util');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const { getOrderTypedData } = require('./eip712utils');

ZWeb3.initialize(web3.currentProvider);

require('chai').should();

/// Used artifacts
const TConverter = Contracts.getFromLocal('TConverter');
const BondedERC20 = Contracts.getFromLocal('BondedERC20');
const BondedHelper = Contracts.getFromLocal('BondedERC20Helper');
const PerformanceCard = Contracts.getFromLocal('PerformanceCard');
const FractionableERC721 = Contracts.getFromLocal('FractionableERC721');

/// Create a Mock Contract
const ERC20Mock = Contracts.getFromLocal('ERC20Mock');

/// check events
function checkEventName(tx, eventName) {
  tx.events[eventName].event.should.be.eq(eventName);
}

// Helper functions

const assertGasLt = async (txHash, expected) => {
  const { gas } = await ZWeb3.getTransaction(txHash);
  gas.should.be.at.most(parseInt(expected));
};

const assertGasEq = async (txHash, expected) => {
  const { gas } = await ZWeb3.getTransaction(txHash);
  gas.should.be.eq(parseInt(expected));
};

const assertGasPrice = async (txHash, expected) => {
  const { gasPrice } = await ZWeb3.getTransaction(txHash);
  parseInt(gasPrice).should.be.eq(expected);
};

const assertFrom = async (txHash, expected) => {
  const { from } = await ZWeb3.getTransaction(txHash);
  from.should.be.eq(expected);
};

const createSignature = async (msgHash, signer) => {
  const signature = await web3.eth.sign(msgHash, signer);

  // in geth its always 27/28, in ganache its 0/1. Change to 27/28 to prevent
  // signature malleability if version is 0/1
  // see https://github.com/ethereum/go-ethereum/blob/v1.8.23/internal/ethapi/api.go#L465
  let v = parseInt(signature.slice(130, 132), 16);

  if (v < 27) {
    v += 27;
  }

  const vHex = v.toString(16);

  return signature.slice(0, 130) + vHex;
}

const createHash = (args) => {
  return soliditySha3(
    { t: 'uint256', v: args['tokenId'] },
    { t: 'string', v: args['symbol'] },
    { t: 'string', v: args['name'] },
    { t: 'uint32', v: args['score'] },
    { t: 'uint256', v: args['cardValue'] }
  );
}

const createCardArgs = (tokenId) => {
  return {
    'tokenId': tokenId,
    'symbol': `T${tokenId}`,
    'name': `Test Card ${tokenId}`,
    'score': 500,
    'cardValue': "762175324675324700000000"
  };
}

contract('PerformanceCard', ([_, owner, admin, someone, anotherone, buyer1, buyer2, buyer3]) => {

  let contract;

  let tsToken;
  let reserveToken;

  let tConverter;
  let fractionableERC721;

  before(async function() {
    const project = await TestHelper();

    /// Create BondedHelper
    const bondedHelper = await BondedHelper.new({ gas: 5000000, from: owner });

    /// Create Mock ERC20 Contracts
    tsToken = await ERC20Mock.new({ gas: 5000000, from: owner });
    reserveToken = await ERC20Mock.new({ gas: 5000000, from: owner });

    /// Create TConverter & FractionableERC721
    tConverter = await TConverter.new({ gas: 5000000, from: owner });
    fractionableERC721 = await FractionableERC721.new({ gas: 5000000, from: owner });

    /// Create new PerformanceCard registry
    contract = await project.createProxy(PerformanceCard, {
      initMethod: 'initialize',
      initArgs: [
        owner,
        fractionableERC721.address,
        tConverter.address,
        tsToken.address,
        reserveToken.address,
      ]
    });

    /// initialize tConverter & fractionableERC721 contracts.

    await tConverter.methods.initialize(owner).send({
      gas: 5000000,
      from: owner
    });

    await fractionableERC721.methods.initialize(
      owner,
      bondedHelper.address,
      "name",
      "symbol"
    ).send({
      gas: 5000000,
      from: owner
    });

    /// set allowed callers to tConverter & fractionableERC721

    await tConverter.methods.setAllowedCaller(contract.address).send({
      gas: 5000000,
      from: owner
    });

    await fractionableERC721.methods.setTokenManager(contract.address).send({
      gas: 5000000,
      from: owner
    })

  });

  describe('Tests Admins Management', function() {

    it(`Should OK addAdmin()`, async function() {
      const tx = await contract.methods.addAdmin(admin).send({
        from: owner
      });

      checkEventName(tx, 'AdminAdded');

      const isAdmin = await contract.methods.isAdmin(admin).call();
      isAdmin.should.be.eq(true);
    });

    it(`Should OK removeAdmin()`, async function() {
      const tx = await contract.methods.removeAdmin(admin).send({
        from: owner
      });

      checkEventName(tx, 'AdminRemoved');

      const isAdmin = await contract.methods.isAdmin(admin).call();
      isAdmin.should.be.eq(false);
    });

    it(`Should FAIL addAdmin() :: not owner`, async function() {
      await assertRevert(
        contract.methods.addAdmin(admin).send({
          from: someone
        })
      );
    });

    it(`Should FAIL addAdmin() :: already admin`, async function() {
      await contract.methods.addAdmin(admin).send({ from: owner });
      await assertRevert(
        contract.methods.addAdmin(admin).send({ from: owner })
      );
    });

    it(`Should FAIL renounceAdmin() :: not admin`, async function() {
      await assertRevert(
        contract.methods.renounceAdmin().send({ from: someone })
      );
    });

    it(`Should OK renounceAdmin()`, async function() {
      const tx = await contract.methods.renounceAdmin().send({ from: admin });

      checkEventName(tx, 'AdminRemoved');

      const isAdmin = await contract.methods.isAdmin(admin).call();
      isAdmin.should.be.eq(false);
    });

  });

  describe('Tests gasPriceLimit Management', function() {

    before(async function() {
      await contract.methods.addAdmin(admin).send({ from: owner });
    });

    it(`Should OK setGasPriceLimit()`, async function() {
      let gasLimit = await contract.methods.gasPriceLimit().call();
      gasLimit.should.be.eq('0');

      const newLimit = toWei('26', 'gwei');

      const tx = await contract.methods.setGasPriceLimit(newLimit).send({
        from: admin
      });

      checkEventName(tx, 'GasPriceLimitChanged');

      gasLimit = await contract.methods.gasPriceLimit().call();
      gasLimit.should.be.eq(newLimit);
    });

    it(`Should FAIL setGasPriceLimit() :: not admin`, async function() {
      const newLimit = toWei('26', 'gwei');

      await assertRevert(
        contract.methods.setGasPriceLimit(newLimit).send({
          from: someone
        })
      );
    });

  });

  describe('Tests baseTokenUri Management', function() {

    it(`Should OK setBaseUrlPath()`, async function() {
      const newUri = 'https://newURL/cards/';

      await contract.methods.setBaseUrlPath(newUri).send({
        from: admin
      })

      const uri = await contract.methods.baseUrlPath().call();
      uri.should.be.eq(newUri);
    });

    it(`Should FAIL setBaseUrlPath() :: not admin`, async function() {
      const newUri = 'https://newURL/cards/';

      await assertRevert(
        contract.methods.setBaseUrlPath(newUri).send({
          from: someone
        })
      );
    });
  });

  describe('Tests Cards Create', function() {

    async function createCard(cardArgs, adminSigner, msgSender) {

      const createCardHash = createHash(cardArgs);
      const adminSignature = await createSignature(createCardHash, adminSigner);

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const expiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        expiration,
        tsToken.address, /// The token contract address
        cardArgs['cardValue'],  // tokens amount
        contract.address // Spender address is the calling contract that transfer tokens in behalf of the user
      );

      // console.log('typedData', typedData);

      /// PK for someone => account (3)
      const orderSignature = ethSign.signTypedData(
        toBuffer('0x646f1ce2fdad0e6deeeb5c7e8e5543bdde65e86029e2fd9fc169899c440a7913'), { data: typedData }
      );

      return contract.methods.createCard(
        cardArgs['tokenId'],
        cardArgs['symbol'],
        cardArgs['name'],
        cardArgs['score'],
        cardArgs['cardValue'],
        createCardHash,
        adminSignature,
        expiration,
        orderId,
        orderSignature
      ).send({
        from: msgSender,
        gas: 5000000,
        gasPrice: toWei('10', 'gwei')
      });
    }

    before(async function() {
      // Set TConverter Token / Reserve pair
      await tsToken.methods.mint(tConverter.address, toWei('10000000')).send();
      await reserveToken.methods.mint(tConverter.address, toWei('120000')).send();

      // Mint tokens for card creator
      await tsToken.methods.mint(someone, toWei('1000000')).send();
    });

    it(`Should OK createCard()`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      await createCard(cardArgs, admin, someone);

      const metaUrl = await contract.methods.getCardURL(tokenId).call();
      metaUrl.should.be.eq(`https://newURL/cards/${tokenId}`);
    });

    it(`Should FAIL createCard() :: card exists`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      await assertRevert(
        createCard(cardArgs, admin, someone)
      );
    });

    it(`Should FAIL createCard() :: bad signer`, async function() {
      const tokenId = 1001;
      const cardArgs = createCardArgs(tokenId);

      await assertRevert(
        createCard(cardArgs, anotherone, someone)
      );
    });
  });

  describe('Test Card Score Management', function() {

    const tokenId = 1000;
    let score = 0;

    it(`should OK getScore()`, async function() {
      score = await contract.methods.getScore(tokenId).call();
      score.should.be.eq('500'); /// created token initial score
    });

    it(`should OK updateScore()`, async function() {
      const newScore = 3500;

      await contract.methods.updateScore(tokenId, newScore).send({
        from: admin
      });

      score = await contract.methods.getScore(tokenId).call();
      score.should.be.eq('3500');
    });

    it(`should OK updateScoresBulk()`, async function() {
      const tokenIds = [tokenId, tokenId];
      const newScores = [2000, 3000];

      await contract.methods.updateScoresBulk(tokenIds, newScores).send({
        from: admin
      });

      score = await contract.methods.getScore(tokenId).call();
      score.should.be.eq('3000');
    });

    it(`should FAIL updateScore() :: not admin`, async function() {
      const newScore = 7000;

      await assertRevert(
        contract.methods.updateScore(tokenId, newScore).send({
          from: someone
        })
      );
    });

  });

  describe('Test purchase / liquidate', function() {

    const tokenId = 1000;

    it('Should FAIL :: send eth to contract', async function() {
      await assertRevert(
        ZWeb3.sendTransaction({
          to: contract.address,
          from: someone,
          value: toWei('1')
        })
      );
    })

    it(`Should OK purchase()`, async function() {

      const paymentAmount = toWei('10');

      const addr = await fractionableERC721.methods.getBondedERC20(tokenId).call();
      const bondedToken = BondedERC20.at(addr);

      const tSupply = await bondedToken.methods.balanceOf(someone).call();
      tSupply.should.be.eq('0');

      /// purchase() and check received tokens == estimation

      const orderId = `0x${randomBytes(16).toString('hex')}`; // create a random orderId
      const expiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        expiration,
        tsToken.address, /// The token contract address
        paymentAmount,  // tokens amount
        contract.address // Spender address is the calling contract that transfer tokens in behalf of the user
      );

      /// PK for 'someone' -> (account 3)
      const orderSignature = ethSign.signTypedData(
        toBuffer('0x646f1ce2fdad0e6deeeb5c7e8e5543bdde65e86029e2fd9fc169899c440a7913'), { from: someone, data: typedData }
      );

      await contract.methods.purchase(
        tokenId,
        paymentAmount,
        expiration,
        orderId,
        orderSignature
      ).send({
        from: someone,
        gas: 5000000
      });

      const newSupply = await bondedToken.methods.balanceOf(someone).call();
      newSupply.should.be.not.eq('0');
    });

    it(`Should OK liquidate()`, async function() {

      const addr = await fractionableERC721.methods.getBondedERC20(tokenId).call();
      const bondedToken = BondedERC20.at(addr);

      /// Sell all balance
      const tSupply = await bondedToken.methods.balanceOf(someone).call();

      await contract.methods.liquidate(
        tokenId,
        tSupply
      ).send({
        from: someone,
        gas: 5000000
      });

      const value = await bondedToken.methods.balanceOf(someone).call();
      value.should.be.eq('0');
    });

  });

});