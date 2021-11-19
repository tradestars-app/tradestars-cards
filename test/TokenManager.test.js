const {
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers')

const { toBN, toWei, fromWei, soliditySha3 } = require('web3-utils');
const { balanceSnap } = require('./helpers/balanceSnap')

/// Used in EIP712
const ethSign = require('eth-sig-util');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const { getOrderTypedData } = require('./helpers/eip712utils');

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

/// Used artifacts
const TSXChild = artifacts.require('TSXChild');
const UnlockRegistry = artifacts.require('UnlockRegistry');
const FractionableERC721 = artifacts.require('FractionableERC721');

const TokenManager = artifacts.require('TokenManager');

const BondedERC20 = artifacts.require('BondedERC20');
const BondedHelper = artifacts.require('BondedERC20Helper');

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
    { t: 'uint256', v: args['cardUnlockAmount'] },
    // add chainID and Contract to order hash
    { t: 'uint256', v: args['chainId'] },
    { t: 'address', v: args['verifyingContract'] },
  );
}

const createCardArgs = (tokenId, unlockWeiAmount, weiContribution) => {
  return {
    'tokenId': tokenId,
    'symbol': `T${tokenId}`,
    'name': `Test Card ${tokenId}`,
    'cardUnlockAmount': unlockWeiAmount, 
    'orderUnlockAmount': weiContribution
  };
}

describe('TokenManager', function () {

  let owner, admin, someone, anotherone, depositorRole;
  let pks = {};

  before(async function() {
    
    [ owner, admin, someone, anotherone, depositorRole ] = await web3.eth.getAccounts();

    /// fill primary keys used for signatures
    pks[admin] = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    pks[someone] = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
    pks[anotherone] = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';

    /// Create reserve contract and add a depositor role for minting
    this.reserveToken = await TSXChild.new({ from: owner });
    this.reserveToken.setDepositor(depositorRole, { from: owner });

    /// Create BondedHelper
    const bondedHelper = await BondedHelper.new({ from: owner });

    /// Create a Fractionable NFT
    this.fractionableERC721 = await FractionableERC721.new(
      bondedHelper.address,
      "TradeStars fNTF",
      "fNFT", {
        from: owner
      }
    );

    /// Create an unlock Registry
    this.unlockRegistry = await UnlockRegistry.new({ from: owner });

    this.contract = await TokenManager.new(
      this.fractionableERC721.address,
      this.reserveToken.address, 
      this.unlockRegistry.address, {
        from: owner
      }
    );

    /// set allowed callers to fractionableERC721
    await this.fractionableERC721.setOperationManager(
      this.contract.address, { from: owner }
    )

    /// set allowed callers to UnlockRegistry
    await this.unlockRegistry.setOperationManager(
      this.contract.address, { from: owner }
    )
  });

  describe('Tests admin', function() {
    it(`OK setAdminAddress()`, async function() {
      await this.contract.setAdminAddress(admin, { from: owner });
    });

    it(`Fails setAdminAddress() :: not owner`, async function() {
      await expectRevert(
        this.contract.setAdminAddress(admin, { from: someone }),
        'Ownable: caller is not the owner'
      );
    });

    it(`OK migrateReserve()`, async function() {
      await this.contract.migrateReserve(
        this.contract.address, { from: owner });
    });

    it(`Fails migrateReserve() :: not owner`, async function() {
      await expectRevert(
        this.contract.migrateReserve(
          this.contract.address, { from: someone }
        ),
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('Tests Cards creation', function() {

    async function createCard(context, cardArgs, adminSigner, msgSender) {
      
      // add chainId and verifying contract to card creation hash
      cardArgs.chainId = await web3.eth.net.getId();
      cardArgs.verifyingContract = context.contract.address;

      const createCardHash = createHash(cardArgs);
      const orderAdminSignature = await createSignature(createCardHash, adminSigner);

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        context.reserveToken.address, /// The token contract address
        cardArgs['orderUnlockAmount'],  // tokens amount
        context.contract.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        msgSender // from address included in the EIP712signature
      );

      // console.log('typedData ::', typedData);
      // console.log('cardArgs ::', cardArgs);

      /// PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[msgSender]), { data: typedData }
      );

      // console.log('eip712TransferSignature', eip712TransferSignature);

      return context.contract.createCard(
        cardArgs['tokenId'],
        cardArgs['symbol'],
        cardArgs['name'],
        cardArgs['cardUnlockAmount'],
        cardArgs['orderUnlockAmount'],
        orderAdminSignature,
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature,
        //
        {
          from: msgSender
        }
      );
    }

    before(async function() {

      console.log('deposit() ->>>', web3.eth.abi.encodeParameter('uint256', toWei('1000000')))

      // Mint tokens for card creator
      await this.reserveToken.deposit(
        someone, web3.eth.abi.encodeParameter('uint256', toWei('10000')), { 
          from: depositorRole 
        }
      );

      await this.reserveToken.deposit(
        anotherone, web3.eth.abi.encodeParameter('uint256', toWei('7000')), { 
          from: depositorRole 
        }
      );
    });

    it(`Should OK createCard()`, async function() {
      const tokenId = 1000;
      const cardUnlockAmount = toWei('1000');
      const cardUnlockContribution = toWei('1000');

      const cardArgs = createCardArgs(
        tokenId, 
        cardUnlockAmount,
        cardUnlockContribution
      );
      
      const reserveTracker = await balanceSnap(
        this.reserveToken, someone, 'someone\s reserve'
      );

      await createCard(this, cardArgs, admin, someone);

      // get bonded ERC20 for balance checks
      const addr = await this.fractionableERC721.getBondedERC20(tokenId);
      const bondedToken = await BondedERC20.at(addr);

      /// check balances
      await reserveTracker.requireDecrease(
        toBN(toWei('1000')) // card value decrease in reserve
      ); 

      const sharesBalance = await bondedToken.balanceOf(someone);
      
      expect(sharesBalance).to.be.eq.BN(
        toWei('10000') // NFT unlock shares
      ); 
    });

    it(`Should FAIL createCard() :: card exists`, async function() {
      const tokenId = 1000;
      const cardUnlockAmount = toWei('1000');
      const cardUnlockContribution = toWei('1000');

      const cardArgs = createCardArgs(
        tokenId, 
        cardUnlockAmount,
        cardUnlockContribution
      );

      await expectRevert(
        createCard(this, cardArgs, admin, someone),
        'createCard() - card already created'
      );
    });

    it(`Should FAIL createCard() :: bad signer`, async function() {
      const tokenId = 1001;
      const cardUnlockAmount = toWei('1000');
      const cardUnlockContribution = toWei('1000');

      const cardArgs = createCardArgs(
        tokenId, 
        cardUnlockAmount,
        cardUnlockContribution
      );

      await expectRevert(
        createCard(this, cardArgs, anotherone, someone),
        'createCard() - invalid admin signature'
      );
    });

    it(`Should OK partial createCard()`, async function() {
      const tokenId = 1002;
      const cardUnlockAmount = toWei('10000');
      const cardUnlockContribution = toWei('1000');

      const cardArgs = createCardArgs(
        tokenId, 
        cardUnlockAmount,
        cardUnlockContribution
      );
      
      const reserveTracker = await balanceSnap(
        this.reserveToken, someone, 'someone\s reserve'
      );

      await createCard(this, cardArgs, admin, someone);

      /// check card value decrease in reserve
      await reserveTracker.requireDecrease(
        toBN(cardUnlockContribution) 
      ); 
    });

    it(`Should OK refund partial createCard()`, async function() {
      const tokenId = 1002;
      const cardUnlockAmount = toWei('10000');
      const cardUnlockContribution = toWei('3000');
      const previousContributionDiff = toWei('2000');

      const cardArgs = createCardArgs(
        tokenId, 
        cardUnlockAmount,
        cardUnlockContribution
      );
      
      const reserveTracker = await balanceSnap(
        this.reserveToken, someone, 'someone\s reserve'
      );
      
      await createCard(this, cardArgs, admin, someone);

      /// check card value decrease in reserve
      await reserveTracker.requireDecrease(
        toBN(previousContributionDiff) 
      ); 
    });

    it(`Should OK create partialy contributed`, async function() {
      const tokenId = 1002;
      const cardUnlockAmount = toWei('10000');
      const cardUnlockContribution = toWei('7000');

      const cardArgs = createCardArgs(
        tokenId, 
        cardUnlockAmount,
        cardUnlockContribution
      );

      const reserveTracker = await balanceSnap(
        this.reserveToken, anotherone, 'anotherone\s reserve'
      );

      await createCard(this, cardArgs, admin, anotherone);

      /// card is unlocked. Check NFT shares 
      const addr = await this.fractionableERC721.getBondedERC20(tokenId);
      const bondedToken = await BondedERC20.at(addr);

      const someoneShares = await bondedToken.balanceOf(someone);
      const anotheroneShares = await bondedToken.balanceOf(anotherone);
      
      // check proportionate to unlock contribution
      expect(someoneShares).to.be.eq.BN(
        toWei('3000') // NFT unlock shares
      ); 

      expect(anotheroneShares).to.be.eq.BN(
        toWei('7000') // NFT unlock shares
      ); 
    });
  });

  describe('Test swap', function() {
    const tokenId = 1000;
    const dstTokenId = 1002;

    it(`Should OK estimateSwap()`, async function() {
      const paymentAmount = toWei('1');

      const { expectedRate, reserveImpact } = await this.contract.estimateSwap(
        tokenId,
        paymentAmount, 
        dstTokenId, {
          from: someone
        }
      );

      console.log('rate:', fromWei(expectedRate).toString());
      console.log('impact (%):', fromWei(reserveImpact).toString());

      console.log('Amount => ',
        fromWei(
          toBN(paymentAmount).mul(expectedRate).div(toBN(1e18))
        ).toString()
      )
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
      const paymentAmount = toWei('1');

      const { expectedRate, reserveImpact } = await this.contract.estimatePurchase(
        tokenId,
        paymentAmount, {
          from: someone
        }
      );

      console.log('rate:', fromWei(expectedRate).toString());
      console.log('impact (%):', fromWei(reserveImpact).toString());

      console.log('Amount => ',
        fromWei(
          toBN(paymentAmount).mul(expectedRate).div(toBN(1e18))
        ).toString()
      )
    });

    it(`Should OK estimateLiquidate()`, async function() {
      const sellingAmount = toWei('3.315563930439905186');

      const { expectedRate, reserveImpact } = await this.contract.estimateLiquidate(
        tokenId,
        sellingAmount, {
          from: someone
        }
      );

      console.log('rate:', fromWei(expectedRate).toString());
      console.log('impact (%):', fromWei(reserveImpact).toString());

      console.log('Amount => ',
        fromWei(
          toBN(sellingAmount).mul(toBN(1e18)).div(expectedRate)
        ).toString()
      )
    });

    it(`Should OK purchase()`, async function() {
      const paymentAmount = toWei('1');
      
      // get at least estimation from last step
      const minTokenAmount = toWei('3.315563930439905186');

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        paymentAmount,  // tokens amount
        this.contract.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      /// PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[someone]), { data: typedData }
      );

      // check balance pre / post purchase
      const addr = await this.fractionableERC721.getBondedERC20(tokenId);
      const bondedToken = await BondedERC20.at(addr);

      const oldSharesSupply = await bondedToken.balanceOf(someone);

      /// purchase() and check received tokens ~= estimation
      await this.contract.purchase(
        tokenId,
        paymentAmount, 
        minTokenAmount, 
        orderExpiration,
        orderId, 
        eip712TransferSignature,
        {
          from: someone
        }
      );
      
      const newSharesSupply = await bondedToken.balanceOf(someone);

      console.log('oldSharesSupply', fromWei(oldSharesSupply).toString());
      console.log('newSharesSupply', fromWei(newSharesSupply).toString());
    });

    it(`Should OK liquidate()`, async function() {

      const sharesAmount = toWei('3.315563930439905186');
      
      // get at least estimation from last step
      const minReserveAmount = toWei('0.989368718397940457');

      const oldReserveSupply = await this.reserveToken.balanceOf(someone);

      await this.contract.liquidate(
        tokenId,
        sharesAmount, 
        minReserveAmount, {
          from: someone
        }
      );

      const newReserveSupply = await this.reserveToken.balanceOf(someone);

      console.log('oldReserveSupply', fromWei(oldReserveSupply).toString());
      console.log('newReserveSupply', fromWei(newReserveSupply).toString());
    });

  });

  describe('Test relayedTx / purchase', function() {

    const tokenId = 1000;

    it(`Should OK purchase() relayed`, async function() {

      const paymentAmount = toWei('1');
      const minTokenAmount = toWei('3.10');

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        paymentAmount,  // tokens amount
        this.contract.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      /// PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[someone]), { data: typedData }
      );
      
      const abiEncoded = await this.contract.contract.methods.purchase(
        tokenId,
        paymentAmount, 
        minTokenAmount, 
        // EIP721
        orderExpiration,
        orderId, 
        eip712TransferSignature
      ).encodeABI();

      /// Test relay

      const nonce = 10000;
      const signer = someone;

      const chainId = await web3.eth.net.getId();

      const orderHash = soliditySha3(
        { t: 'uint256', v: nonce },
        { t: 'address', v: signer },
        { t: 'bytes', v: abiEncoded },
        { t: 'uint256', v: chainId } // hardhat default chainId
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
        chainId: chainId,
        nonce: await web3.eth.getTransactionCount(signer),
      }

      /// PK for 'signer'
      const signedTx = await web3.eth.accounts.signTransaction(
        txParams, pks[signer]
      );

      // Send Tx
      await web3.eth.sendSignedTransaction(signedTx.rawTransaction);
    });

  });

  describe('Test upgrade', function() {
    it(`Should OK migrateReserve()`, async function() {

      const preBalance = await this.reserveToken.balanceOf(this.contract.address);

      const newTokenManager = await TokenManager.new(
        this.fractionableERC721.address,
        this.reserveToken.address, 
        this.unlockRegistry.address, {
          from: owner
        }
      );

      await this.contract.migrateReserve(
        newTokenManager.address, { 
          from: owner 
        }
      );

      const postBalance = await this.reserveToken.balanceOf(
        newTokenManager.address
      );
      
      expect(postBalance).to.be.eq.BN(preBalance);
    });
  });

});
