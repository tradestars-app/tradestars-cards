const { accounts, contract, web3, privateKeys } = require('@openzeppelin/test-environment')

const {
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers')

const { toWei, soliditySha3 } = require('web3-utils');

/// Used in EIP712
const ethSign = require('eth-sig-util');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const { getOrderTypedData } = require('./eip712utils');

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

/// Used artifacts
const BondedERC20 = contract.fromArtifact('BondedERC20');
const BondedHelper = contract.fromArtifact('BondedERC20Helper');
const PerformanceCard = contract.fromArtifact('PerformanceCard');
const FractionableERC721 = contract.fromArtifact('FractionableERC721');

/// Create a Mock Contract
const ERC20Mock = contract.fromArtifact('ERC20Mock');

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
    { t: 'uint256', v: args['cardValue'] }
  );
}

const createCardArgs = (tokenId) => {
  return {
    'tokenId': tokenId,
    'symbol': `T${tokenId}`,
    'name': `Test Card ${tokenId}`,
    'cardValue': toWei('10') // 10 ether
  };
}

describe('PerformanceCard', function () {

  const [ owner, admin, someone, anotherone ] = accounts;

  before(async function() {

    /// Create Mock ERC20 Contracts
    this.reserveToken = await ERC20Mock.new(
      "erc20Mock",
      "mock", {
        from: owner
      }
    );

    /// Create BondedHelper
    const bondedHelper = await BondedHelper.new({ from: owner });

    this.fractionableERC721 = await FractionableERC721.new(
      bondedHelper.address,
      "name",
      "symbol", {
        from: owner
      }
    );

    this.contract = await PerformanceCard.new({ from: owner })

    await this.contract.initialize(
      this.fractionableERC721.address,
      this.reserveToken.address, {
        from: owner
      }
    );

    /// set allowed callers to fractionableERC721
    await this.fractionableERC721.setTokenManager(this.contract.address, {
        from: owner
      }
    )

  });

  describe('Tests Admins Management', function() {

    it(`Should OK addAdmin()`, async function() {
      const tx = await this.contract.addAdmin(admin, {
        from: owner
      });

      expectEvent(tx, 'AdminAdded');

      const isAdmin = await this.contract.isAdmin(admin)
      expect(isAdmin).to.be.true;
    });

    it(`Should OK removeAdmin()`, async function() {
      const tx = await this.contract.removeAdmin(admin, {
        from: owner
      });

      expectEvent(tx, 'AdminRemoved');

      const isAdmin = await this.contract.isAdmin(admin)
      expect(isAdmin).to.be.false;
    });

    it(`Should FAIL addAdmin() :: not owner`, async function() {
      await expectRevert(
        this.contract.addAdmin(admin, {
          from: someone
        }),
        'Ownable: caller is not the owne'
      );
    });

    it(`Should FAIL addAdmin() :: already admin`, async function() {
      await this.contract.addAdmin(admin, { from: owner });
      await expectRevert(
        this.contract.addAdmin(admin, {
          from: owner
        }),
        'Administrable: wallet already admin'
      );
    });

    it(`Should FAIL renounceAdmin() :: not admin`, async function() {
      await expectRevert(
        this.contract.renounceAdmin({
          from: someone
        }),
        'Administrable: sender is not admin'
      );
    });

    it(`Should OK renounceAdmin()`, async function() {
      const tx = await this.contract.renounceAdmin({ from: admin });

      expectEvent(tx, 'AdminRemoved');

      const isAdmin = await this.contract.isAdmin(admin)

      expect(isAdmin).to.be.false;
    });

  });

  describe('Tests gasPriceLimit Management', function() {

    before(async function() {
      await this.contract.addAdmin(admin, { from: owner });
    });

    it(`Should OK setGasPriceLimit()`, async function() {
      let gasLimit = await this.contract.gasPriceLimit()
      expect(gasLimit).to.be.eq.BN('0');

      const newLimit = toWei('26', 'gwei');

      const tx = await this.contract.setGasPriceLimit(newLimit, {
        from: admin
      });

      expectEvent(tx, 'GasPriceLimitChanged');

      gasLimit = await this.contract.gasPriceLimit()
      expect(gasLimit).to.be.eq.BN(newLimit);
    });

    it(`Should FAIL setGasPriceLimit() :: not admin`, async function() {
      const newLimit = toWei('26', 'gwei');

      await expectRevert(
        this.contract.setGasPriceLimit(newLimit, {
          from: someone
        }),
        "Administrable: sender is not admin"
      );
    });

  });

  describe('Tests Cards creation', function() {

    async function createCard(context, cardArgs, adminSigner, msgSender) {

      const createCardHash = createHash(cardArgs);
      const adminSignature = await createSignature(createCardHash, adminSigner);

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const expiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        expiration,
        context.reserveToken.address, /// The token contract address
        cardArgs['cardValue'],  // tokens amount
        context.contract.address // Spender address is the calling contract that transfer tokens in behalf of the user
      );

      // console.log('typedData', typedData);

      /// PK for someone => account (2)
      const orderSignature = ethSign.signTypedData(
        toBuffer(privateKeys[2]), { data: typedData } //
      );

      return context.contract.createCard(
        cardArgs['tokenId'],
        cardArgs['symbol'],
        cardArgs['name'],
        cardArgs['cardValue'],
        createCardHash,
        adminSignature,
        expiration,
        orderId,
        orderSignature, {
          from: msgSender,
          gasPrice: toWei('10', 'gwei')
        }
      );
    }

    before(async function() {
      // Mint tokens for card creator
      await this.reserveToken.mint(someone, toWei('1000000'), );
    });

    it(`Should OK createCard()`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      const tx = await createCard(this, cardArgs, admin, someone);
    });

    it(`Should FAIL createCard() :: card exists`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      await expectRevert(
        createCard(this, cardArgs, admin, someone),
        'PerformanceCard: card already created.'
      );
    });

    it(`Should FAIL createCard() :: bad signer`, async function() {
      const tokenId = 1001;
      const cardArgs = createCardArgs(tokenId);

      await expectRevert(
        createCard(this, cardArgs, anotherone, someone),
        'PerformanceCard: invalid admin signature'
      );
    });
  });

  describe('Test purchase / liquidate', function() {

    const tokenId = 1000;

    it('Should FAIL :: send eth to contract', async function() {
      await expectRevert.unspecified(
        this.contract.send(toWei('1'), {
          from: someone
        })
      );
    })

    it(`Should OK purchase()`, async function() {

      const paymentAmount = toWei('10');

      const addr = await this.fractionableERC721.getBondedERC20(tokenId)
      const bondedToken = await BondedERC20.at(addr);

      const tSupply = await bondedToken.balanceOf(someone)

      /// purchase() and check received tokens == estimation

      const orderId = `0x${randomBytes(16).toString('hex')}`; // create a random orderId
      const expiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        expiration,
        this.reserveToken.address, /// The token contract address
        paymentAmount,  // tokens amount
        this.contract.address // Spender address is the calling contract that transfer tokens in behalf of the user
      );

      /// PK for 'someone' -> (account 2)
      const orderSignature = ethSign.signTypedData(
        toBuffer(privateKeys[2]), { from: someone, data: typedData }
      );

      await this.contract.purchase(
        tokenId,
        paymentAmount,
        expiration,
        orderId,
        orderSignature, {
          from: someone
        }
      );

      const newSupply = await bondedToken.balanceOf(someone)

      // TODO: Change
      expect(newSupply).to.be.not.eq.BN('0');
    });

    it(`Should OK liquidate()`, async function() {

      const addr = await this.fractionableERC721.getBondedERC20(tokenId)
      const bondedToken = await BondedERC20.at(addr);

      /// Sell all balance
      const tSupply = await bondedToken.balanceOf(someone)

      await this.contract.liquidate(
        tokenId,
        tSupply, {
          from: someone
        }
      );

      const value = await bondedToken.balanceOf(someone)

      expect(value).to.be.eq.BN('0');
    });

  });

  describe('Test relayedTx / purchase', function() {
    const tokenId = 1000;

    it(`Should OK purchase() relayed`, async function() {

      const paymentAmount = toWei('10');

      const addr = await this.fractionableERC721.getBondedERC20(tokenId)
      const bondedToken = await BondedERC20.at(addr);

      const tSupply = await this.reserveToken.balanceOf(someone)
      expect(tSupply).to.be.gte.BN(paymentAmount)

      /// purchase() and check received tokens == estimation

      const orderId = `0x${randomBytes(16).toString('hex')}`; // create a random orderId
      const expiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        expiration,
        this.reserveToken.address, /// The token contract address
        paymentAmount,  // tokens amount
        this.contract.address // Spender address is the calling contract that transfer tokens in behalf of the user
      );

      /// PK for 'someone' -> (account 2)
      const orderSignature = ethSign.signTypedData(
        toBuffer(privateKeys[2]), { from: someone, data: typedData }
      );

      const abiEncoded = this.contract.contract.methods.purchase(
        tokenId,
        paymentAmount,
        expiration,
        orderId,
        orderSignature,
      ).encodeABI()

      /// Test relay

      const nonce = 10000;
      const signer = someone;

      const orderHash = soliditySha3(
        { t: 'uint256', v: nonce },
        { t: 'address', v: signer },
        { t: 'bytes', v: abiEncoded },
      );

      // relay tx

      const orderHashSignature = await createSignature(orderHash, signer);
      const ordedEncoded = this.contract.contract.methods.executeRelayedTx(
        nonce,
        signer,
        abiEncoded,
        orderHashSignature
      ).encodeABI();

      const txParams = {
        data: ordedEncoded,
        to: this.contract.address,
        gas: 5e6, // 5mwei
        gasPrice: String(5e9), // 5gwei
        //
        chainId: await web3.eth.net.getId(),
        nonce: await web3.eth.getTransactionCount(signer),
      }

      /// PK for 'signer' -> (account 2)
      const signedTx = await web3.eth.accounts.signTransaction(
        txParams, privateKeys[2]
      );

      // Send Tx
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      const newSupply = await this.reserveToken.balanceOf(signer)

      expect(newSupply).to.be.not.eq.BN('0');
    });

  });

});
