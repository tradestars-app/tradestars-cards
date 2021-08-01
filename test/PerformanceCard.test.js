const {
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers')

const { toBN, toWei, fromWei, soliditySha3 } = require('web3-utils');

/// Used in EIP712
const ethSign = require('eth-sig-util');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const { getOrderTypedData } = require('./eip712utils');

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

/// Used artifacts
const BondedERC20 = artifacts.require('BondedERC20');
const BondedHelper = artifacts.require('BondedERC20Helper');
const PerformanceCard = artifacts.require('PerformanceCard');
const FractionableERC721 = artifacts.require('FractionableERC721');

/// Create a Mock Contract
const ERC20Mock = artifacts.require('ERC20Mock');

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
    'cardValue': toWei('2000', "Mwei") 
  };
}

describe('PerformanceCard', function () {

  let owner, admin, someone, anotherone;

  before(async function() {
    
    [ owner, admin, someone, anotherone ] = await web3.eth.getAccounts();

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

    this.contract = await PerformanceCard.new(
      this.fractionableERC721.address,
      this.reserveToken.address, {
        from: owner
      }
    );

    /// set allowed callers to fractionableERC721
    await this.fractionableERC721.setTokenManager(
      this.contract.address, { from: owner }
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

      return context.contract.createCard(
        cardArgs['tokenId'],
        cardArgs['symbol'],
        cardArgs['name'],
        cardArgs['cardValue'],
        cardArgs['cardValue'], // test 
        createCardHash,
        adminSignature, {
          from: msgSender,
          gasPrice: toWei('10', 'gwei')
        }
      );
    }

    before(async function() {
      // Mint tokens for card creator
      await this.reserveToken.mint(someone, toWei('1000000'));

      // approve to someone
      await this.reserveToken.approve(
        this.contract.address, toWei('1000000'), {
          from: someone
        }
      );
    });

    it(`Should OK createCard()`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      await createCard(this, cardArgs, admin, someone);
    });

    it(`Should FAIL createCard() :: card exists`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      await expectRevert(
        createCard(this, cardArgs, admin, someone),
        'PerformanceCard: card already created'
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
        this.contract.send(toWei('1'), { from: someone })
      );
    })

    it(`Should OK estimatePurchase()`, async function() {
      const paymentAmount = toWei('1', 'Mwei');

      const { expectedRate, slippageRate } = await this.contract.estimatePurchase(
        tokenId,
        paymentAmount, {
          from: someone
        }
      );

      console.log(fromWei(expectedRate).toString());
      console.log(fromWei(slippageRate).toString());

      console.log(
        fromWei(
          toBN(paymentAmount).mul(1e12).div(expectedRate)
        ).toString()
      )
      
      // expect(newSupply).to.be.not.eq.BN('0');
    });

    it(`Should OK estimateLiquidate()`, async function() {
      const sellingAmount = toWei('1');

      const { expectedRate, slippageRate } = await this.contract.estimateLiquidate(
        tokenId,
        sellingAmount, {
          from: someone
        }
      );

      console.log(fromWei(expectedRate).toString());
      console.log(fromWei(slippageRate).toString());

      // expect(newSupply).to.be.not.eq.BN('0');
    });

    it(`Should OK purchase()`, async function() {
      const paymentAmount = toWei('10');

      const addr = await this.fractionableERC721.getBondedERC20(tokenId)
      const bondedToken = await BondedERC20.at(addr);

      /// purchase() and check received tokens == estimation

      await this.contract.purchase(
        tokenId,
        paymentAmount, {
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
      const sellAmount = tSupply.div(new BN(2));

      await this.contract.liquidate(
        tokenId,
        sellAmount, {
          from: someone
        }
      );

      const value = await bondedToken.balanceOf(someone)

      expect(value).to.be.eq.BN(sellAmount);
    });

  });

  describe('Test relayedTx / purchase', function() {

    const tokenId = 1000;

    it(`Should OK purchase() relayed`, async function() {

      const paymentAmount = toWei('10');

      const addr = await this.fractionableERC721.getBondedERC20(tokenId);
      const bondedToken = await BondedERC20.at(addr);

      /// purchase() and check received tokens == estimation

      const abiEncoded = await this.contract.contract.methods.purchase(
        tokenId,
        paymentAmount
      ).encodeABI();

      /// Test relay

      const nonce = 10000;
      const signer = someone;

      const orderHash = soliditySha3(
        { t: 'uint256', v: nonce },
        { t: 'address', v: signer },
        { t: 'bytes', v: abiEncoded },
        { t: 'uint256', v: 31337 } // hardhat chainId
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
      /// 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
      const signedTx = await web3.eth.accounts.signTransaction(
        txParams, '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a'
      );

      // Send Tx
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction);

      const newSupply = await this.reserveToken.balanceOf(signer)

      expect(newSupply).to.be.not.eq.BN('0');
    });

  });

  describe('Test upgrade', function() {
    it(`Should OK upgrade()`, async function() {

      await this.reserveToken.mint(this.contract.address, '1000');

      const preBalance = await this.reserveToken.balanceOf(this.contract.address);

      const c = await PerformanceCard.new(
        this.fractionableERC721.address,
        this.reserveToken.address, {
          from: owner
        }
      );

      await this.contract.upgrade(c.address, { from: owner });

      const postBalance = await this.reserveToken.balanceOf(c.address);

      expect(postBalance).to.be.eq.BN(preBalance);
    });
  });

});
