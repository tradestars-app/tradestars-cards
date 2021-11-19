const {
  BN, // big number
} = require('@openzeppelin/test-helpers')

const { toWei, toBN } = require('web3-utils');
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
const Cashier = artifacts.require('Cashier');

describe('Cashier', function () {

  let owner, someone, depositorRole;
  let pks = {};

  before(async function() {
    [ owner, someone, anotherOne, depositorRole ] = await web3.eth.getAccounts();

    pks[someone] = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

    /// Create reserve contract and add a depositor role for minting
    this.reserveToken = await TSXChild.new({ from: owner });
    this.reserveToken.setDepositor(depositorRole, { from: owner });

    this.contract = await Cashier.new({ from: owner });
  });

  describe('Tests Transfer', function() {

    before(async function() {
      console.log('deposit() ->>>', web3.eth.abi.encodeParameter('uint256', toWei('1000000')))

      // Mint tokens for card creator
      await this.reserveToken.deposit(
        someone, web3.eth.abi.encodeParameter('uint256', toWei('10000')), { 
          from: depositorRole 
        }
      );
    });

    it(`Should OK transfer()`, async function() {
      const transferAmount = toWei('100');
      
      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        transferAmount,  // tokens amount
        anotherOne, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      /// PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[someone]), { data: typedData }
      );

      // check balance pre / post purchase
      const srcTracker = await balanceSnap(
        this.reserveToken, someone, 'someone\s reserve'
      );
      const dstTracker = await balanceSnap(
        this.reserveToken, anotherOne, 'anotherone\s reserve'
      );

      /// purchase() and check received tokens ~= estimation
      await this.contract.transfer(
        this.reserveToken.address,
        someone, // from
        anotherOne, // to
        transferAmount, // amount
        // EIP712
        orderExpiration,
        orderId, 
        eip712TransferSignature,
        {
          from: someone
        }
      );
      
      /// check card value decrease in reserve
      await srcTracker.requireDecrease(toBN(transferAmount));
      await dstTracker.requireIncrease(toBN(transferAmount));
    });
  });
});