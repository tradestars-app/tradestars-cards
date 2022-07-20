const {
  BN, // big number
  expectEvent,
  expectRevert
} = require('@openzeppelin/test-helpers')

const { toWei, toBN, soliditySha3 } = require('web3-utils');
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
const ERC20 = artifacts.require('MockERC20');
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000"

const createSignature = async (msgHash, signer) => {
  const signature = await web3.eth.sign(msgHash, signer);
  let v = parseInt(signature.slice(130, 132), 16);

  if (v < 27) {
    v += 27;
  }

  const vHex = v.toString(16);

  return signature.slice(0, 130) + vHex;
}

const depositHash = (args) => {
  return soliditySha3(
    { t: 'address', v: args['token'] },
    { t: 'uint256', v: args['amountSrc'] },
    { t: 'uint256', v: args['amountReserve'] },      
    { t: 'uint256', v: args['orderExpiration'] },      
    // add chainID and Contract to order hash
    { t: 'uint256', v: args['chainId'] },
    { t: 'address', v: args['verifyingContract'] },
  );
}

describe('Cashier', function () {

  let owner, someone, depositorRole;
  let pks = {};

  before(async function() {
    [ 
      owner, 
      admin, 
      someone, 
      anotherOne, 
      depositorRole
    ] = await web3.eth.getAccounts();

    /// fill primary keys used for signatures
    pks[admin] = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    pks[someone] = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
    pks[anotherOne] = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';  

    /// Create reserve contract and add a depositor role for minting
    this.reserveToken = await TSXChild.new({ from: owner });
    this.reserveToken.setDepositor(depositorRole, { from: owner });

    // Create cashier contrat and set admin addr
    this.contract = await Cashier.new(this.reserveToken.address, {from: owner });
    this.contract.setAdminAddress(admin, { from: owner });

    // Create some ERC20 token
    this.ERC20token = await ERC20.new();
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

  describe('Tests Deposit', function(){
    
    before(async function(){
      // Mint Reserve Tokens for contract balance
      await this.reserveToken.deposit(
        this.contract.address, web3.eth.abi.encodeParameter('uint256', toWei('1000000')), { 
          from: depositorRole 
        }
      );

      // Mint ERC20 tokens and approve Cashier to move them
      const initialSupply = toWei('1000000');
      await this.ERC20token.mint(someone, initialSupply);
      await this.ERC20token.approve(
        this.contract.address, 
        initialSupply, 
        { 
          from: someone 
        }
      );

    });

    it('Should NOT deposit if signature is expired', async function(){

      amountSrc = toWei('10')
      amountReserve = toWei('100')
      orderExpiration = 1

      const depositHashArgs = {
        'token': this.ERC20token.address,
        'amountSrc': amountSrc,
        'amountReserve': amountReserve,
        'orderExpiration': orderExpiration
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.contract.address
      }
    
      const hash = depositHash(
        { ...depositHashArgs, ...signatureParams }
      );      

      const signature = await createSignature(hash, someone);       

      await expectRevert(this.contract.deposit(
        this.ERC20token.address,
        someone,
        anotherOne,
        amountSrc,
        amountReserve,
        orderExpiration,
        signature,
        {
          from: someone,
        }        
      ), 'deposit(): signature is expired')

    });

    it('Should NOT deposit if signature is invalid', async function(){

      amountSrc = toWei('10')
      amountReserve = toWei('100')
      orderExpiration = await web3.eth.getBlockNumber() + 10

      const depositHashArgs = {
        'token': this.ERC20token.address,
        'amountSrc': amountSrc,
        'amountReserve': amountReserve,
        'orderExpiration': orderExpiration
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.contract.address
      }
    
      const hash = depositHash(
        { ...depositHashArgs, ...signatureParams }
      );      
      
      // INVALID SIGN
      const signature = await createSignature(hash, someone);             

      await expectRevert(this.contract.deposit(
        this.ERC20token.address,
        someone,
        anotherOne,
        amountSrc,
        amountReserve,
        orderExpiration,
        signature,
        {
          from: someone,
        }        
      ), 'deposit() - invalid admin signature')

    });

    it('Should OK deposit ERC20 token and receive Reserve Token', async function(){

      amountSrc = toWei('10')
      amountReserve = toWei('100')
      orderExpiration = 18

      const depositHashArgs = {
        'token': this.ERC20token.address,
        'amountSrc': amountSrc,
        'amountReserve': amountReserve,
        'orderExpiration': orderExpiration
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.contract.address
      }
    
      const hash = depositHash(
        { ...depositHashArgs, ...signatureParams }
      );      
      
      // VALID SIGN
      const signature = await createSignature(hash, admin);             

      // check balance pre deposit
      const someoneERC20Tracker = await balanceSnap(
        this.ERC20token, someone, 'someone\s ERC20'
      );  

      const anotherOneReserveTracker = await balanceSnap(
        this.reserveToken, anotherOne, 'anotherone\s reserve'
      );  

      const contractReserveTracker = await balanceSnap(
        this.reserveToken, this.contract.address, 'someone\s reserve'
      );        

      const contractERC20Tracker = await balanceSnap(
        this.ERC20token, this.contract.address, 'contract\s ERC20'
      );         

      tx = await this.contract.deposit(
        this.ERC20token.address,
        someone,
        anotherOne,
        amountSrc,
        amountReserve,
        orderExpiration,
        signature,
        {
          from: someone,
        }
      )

      // increase - decrease asserts
      // ERC20
      await someoneERC20Tracker.requireDecrease(toBN(amountSrc));      
      await contractERC20Tracker.requireIncrease(toBN(amountSrc));      
      
      // Reserve
      await anotherOneReserveTracker.requireIncrease(toBN(amountReserve));      
      await contractReserveTracker.requireDecrease(toBN(amountReserve)); 
      
      /// check event
      expectEvent(tx, 'Deposit', { 
        'token': this.ERC20token.address,
        'from': someone,
        'to': anotherOne,
        'srcAmount': amountSrc,
        'reserveAmount': amountReserve,
      });     

    });

    it('Should NOT deposit if signature is disabled (already used)', async function(){

      // try to use same sign twice

      amountSrc = toWei('10')
      amountReserve = toWei('100')
      orderExpiration = 18

      const depositHashArgs = {
        'token': this.ERC20token.address,
        'amountSrc': amountSrc,
        'amountReserve': amountReserve,
        'orderExpiration': orderExpiration
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.contract.address
      }
    
      const hash = depositHash(
        { ...depositHashArgs, ...signatureParams }
      );      
      
      const signature = await createSignature(hash, admin);                   

      await expectRevert(this.contract.deposit(
        this.ERC20token.address,
        someone,
        anotherOne,
        amountSrc,
        amountReserve,
        orderExpiration,
        signature,
        {
          from: someone,
        }        
      ), 'deposit(): signature disabled');      

    });    

    it('Should OK deposit Native token and receive Reserve Token', async function(){

      amountSrc = toWei('10')
      amountReserve = toWei('100')
      orderExpiration = await web3.eth.getBlockNumber() + 10

      const depositHashArgs = {
        'token': ZERO_ADDRESS,
        'amountSrc': amountSrc,
        'amountReserve': amountReserve,
        'orderExpiration': orderExpiration
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.contract.address
      }
    
      const hash = depositHash(
        { ...depositHashArgs, ...signatureParams }
      );      
      
      // VALID SIGN
      const signature = await createSignature(hash, admin);             

      // check balance pre deposit
      const someoneNativeTokenBefore = await web3.eth.getBalance(
        someone
      )
      const contractNativeTokenBefore = await web3.eth.getBalance(
        this.contract.address
      )      

      const anotherOneReserveTracker = await balanceSnap(
        this.reserveToken, anotherOne, 'anotherone\s reserve'
      );  

      const contractReserveTracker = await balanceSnap(
        this.reserveToken, this.contract.address, 'someone\s reserve'
      );        

      tx = await this.contract.deposit(
        ZERO_ADDRESS,
        someone,
        anotherOne,
        amountSrc,
        amountReserve,
        orderExpiration,
        signature,
        {
          from: someone,
          value: amountSrc
        }
      )

      // increase - decrease asserts
      // ERC20
      const someoneNativeTokenAfter = await web3.eth.getBalance(
        someone
      )
      expect(someoneNativeTokenAfter).to.not.equal(someoneNativeTokenBefore);

      const contractNativeTokenAfter = await web3.eth.getBalance(
        this.contract.address
      )            
      expect(contractNativeTokenAfter).to.not.equal(contractNativeTokenBefore);

      
      // Reserve
      await anotherOneReserveTracker.requireIncrease(toBN(amountReserve));      
      await contractReserveTracker.requireDecrease(toBN(amountReserve)); 
      
      /// check event
      expectEvent(tx, 'Deposit', { 
        'token': ZERO_ADDRESS,
        'from': someone,
        'to': anotherOne,
        'srcAmount': amountSrc,
        'reserveAmount': amountReserve,
      });     

    });

    it('Should NOT collect balances if caller is not the owner', async function(){
      
      tokens = [this.ERC20token.address]
      collectorAdd = owner
      
      await expectRevert( 
        this.contract.collectBalances(
          tokens,
          collectorAdd,
          {
            from: someone,
          }
      ), 'Ownable: caller is not the owner')

    });

    it('Should OK collect ERC20 balances', async function(){
      tokens = [this.ERC20token.address]
      collectorAdd = owner
      amountSrc = toWei('10') //ERC20 amount already in contract

      const collectorERC20Tracker = await balanceSnap(
        this.ERC20token, collectorAdd, 'collector\s reserve'
      );       
      const contractERC20Tracker = await balanceSnap(
        this.ERC20token, this.contract.address, 'contract\s reserve'
      );               
      
      await this.contract.collectBalances(
          tokens,
          collectorAdd,
          {
            from: owner,
          }
      );

      // increase - decrease asserts
      // ERC20
      await contractERC20Tracker.requireDecrease(toBN(amountSrc));      
      await collectorERC20Tracker.requireIncrease(toBN(amountSrc));      
    });

    it('Should OK collect Native token balance', async function(){
      tokens = [ZERO_ADDRESS]
      collectorAdd = owner
      amountSrc = toWei('10') //Native token amount already in contract

      const ownerNativeTokenBefore = await web3.eth.getBalance(
        owner
      )
      const contractNativeTokenBefore = await web3.eth.getBalance(
        this.contract.address
      )

      tx = await this.contract.collectBalances(
        tokens,
        collectorAdd,
        {
          from: owner,
        }
      );      

      const ownerNativeTokenAfter = await web3.eth.getBalance(
        owner
      )
      const contractNativeTokenAfter = await web3.eth.getBalance(
        this.contract.address
      )     

      expect(ownerNativeTokenAfter).to.not.equal(ownerNativeTokenBefore);
      expect(contractNativeTokenAfter).to.not.equal(contractNativeTokenBefore);


    });

  });
});