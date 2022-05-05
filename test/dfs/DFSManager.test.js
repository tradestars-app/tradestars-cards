const { 
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const {toBN, soliditySha3 } = require('web3-utils');

const { expect } = require('chai');

const ethSign = require('eth-sig-util');
const { getOrderTypedData } = require('../helpers/eip712utils');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const ERC20 = artifacts.require('MockERC20');
const DSFManager = artifacts.require('DSFManager');

contract('ContestManager', function (accounts) {

  const [ owner, admin, someone, anotherone ] = accounts;
  let pks = {};
  pks[someone] = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';  

  const createSignature = async (msgHash, signer) => {
    const signature = await web3.eth.sign(msgHash, signer);
    let v = parseInt(signature.slice(130, 132), 16);

    if (v < 27) {
      v += 27;
    }

    const vHex = v.toString(16);

    return signature.slice(0, 130) + vHex;
  }

  const createEntryHash = (args) => {
    return soliditySha3(
      { t: 'uint256', v: args['contestId'] },
      { t: 'uint256', v: args['entryFee'] },
      //{ t: 'uint8', v: args['draftedPlayersArr'] },
      // add chainID and Contract to order hash
      { t: 'uint256', v: args['chainId'] },
      { t: 'address', v: args['verifyingContract'] },
    );
  }

  const claimRewardHash = (args) => {
    return soliditySha3(
      { t: 'uint256', v: args['contestId'] },
      { t: 'uint256', v: args['rewardAmount'] },
      // add chainID and Contract to order hash
      { t: 'uint256', v: args['chainId'] },
      { t: 'address', v: args['verifyingContract'] },
    );
  }  

  beforeEach(async function () {

      this.token = await ERC20.new();

      // create ContestManager
      this.contestManager = await ContestManager.new(
        this.token.address,
        this.token.address //fee collector address, WIP
      );

      // send Tokens to ContestManager
      //this.token.approve(this.contestManager.address, 1000)

      // mint tokens to contract address
      const initialSupply = toBN(10000)
      await this.token.mint(this.contestManager.address, initialSupply);

      // set admin address
      await this.contestManager.setAdminAddress(
        admin
      );

  })

  describe("createEntry", function () {
    it("createEntry should transfer fee and emit event", async function () {

      const contestId=1
      const entryFee=100
      const draftedPlayersArr=[50, 70, 87, 45, 32, 34, 65, 63, 67, 98, 76]
  
      const createEntryArgs = {
          'contestId': contestId,
          'entryFee': entryFee,
          //'draftedPlayersArr': draftedPlayersArr,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.contestManager.address
      };
  
      const entryHash = createEntryHash(createEntryArgs);
      const orderAdminSignature = await createSignature(entryHash, admin);   
      
      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.token.address, /// The token contract address
        entryFee,  // tokens amount
        this.contestManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // PK for msgSender
       const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[someone]), { data: typedData }
          );
  
      const tx = await this.contestManager.createEntry(
        contestId, 
        entryFee, 
        draftedPlayersArr, 
        orderAdminSignature, 
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature,
        { 
          from: someone 
        }
      )

      expectEvent(tx, 'Entry', { 
        'from': someone,
        'contestId': toBN(contestId),
        'entryFee': toBN(entryFee), 
        // 'playersArr': draftedPlayersArr included in emit but not supported by OpenZeppelin test-helper
      });      

      // Check contest balance after sending fees

      // await this.token.balanceOf(this.contestManager.address).then(v => {
      //   console.log(v.toString());
      // })
    })

    it("createEntry should revert if check signature fails", async function () {
      const contestId=1
      const entryFee=10
      const draftedPlayersArr=[50, 70, 87, 45, 32, 34, 65, 63, 67, 98, 76]
  
      const createEntryArgs = {
        'contestId': contestId,
        'entryFee': entryFee,
        //'draftedPlayersArr': draftedPlayersArr,
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.contestManager.address
      };
  
      const entryHash = createEntryHash(createEntryArgs);
      const orderSomeoneSignature = await createSignature(entryHash, someone);  

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.token.address, /// The token contract address
        entryFee,  // tokens amount
        this.contestManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // PK for msgSender
       const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[someone]), { data: typedData }
          );
  
      await expectRevert(
        this.contestManager.createEntry(
          contestId, 
          entryFee, 
          draftedPlayersArr, 
          orderSomeoneSignature, 
          // EIP712.
          orderExpiration,
          orderId,
          eip712TransferSignature,
          { 
            from: someone 
          }
        ), "_checkOrderSignature() - invalid admin signature");      
    })
  })

  describe("claimReward", function () {
    it("claimReward should send rewards and emit event", async function () {

      const contestId=1
      const rewardAmount=10
  
      const claimRewardArgs = {
          'contestId': contestId,
          'rewardAmount': rewardAmount,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.contestManager.address
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderAdminSignature = await createSignature(rewardHash, admin);   
      
      const tx = await this.contestManager.claimReward(
        contestId, 
        rewardAmount, 
        orderAdminSignature, 
        { 
          from: someone 
        }        
      )

      expectEvent(tx, 'Claim', { 
        'from': someone,
        'contestId': toBN(contestId),
        'claimAmount': toBN(rewardAmount), 
      });      
      

    })
    it("claimReward should revert if check signature fails", async function () {

      const contestId=1
      const rewardAmount=10
  
      const claimRewardArgs = {
          'contestId': contestId,
          'rewardAmount': rewardAmount,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.contestManager.address
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderSomeoneSignature = await createSignature(rewardHash, someone);   
      
      await expectRevert(
        this.contestManager.claimReward(
          contestId, 
          rewardAmount, 
          orderSomeoneSignature, 
          { 
            from: someone 
          }        
        ), "_checkOrderSignature() - invalid admin signature");         

    })
  })
});