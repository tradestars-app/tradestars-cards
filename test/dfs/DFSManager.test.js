const { 
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const {toWei, toBN, soliditySha3 } = require('web3-utils');
const { balanceSnap } = require('../helpers/balanceSnap')

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

const ethSign = require('eth-sig-util');
const { getOrderTypedData } = require('../helpers/eip712utils');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const TSXChild = artifacts.require('TSXChild');
const DFSManager = artifacts.require('DFSManager');
const ContestStorage = artifacts.require('ContestStorage')
const EntryStorage = artifacts.require('EntryStorage')

const createSignature = async (msgHash, signer) => {
  const signature = await web3.eth.sign(msgHash, signer);
  let v = parseInt(signature.slice(130, 132), 16);

  if (v < 27) {
    v += 27;
  }

  const vHex = v.toString(16);

  return signature.slice(0, 130) + vHex;
}

const createContestHash = (args) => {
  return soliditySha3(
    { t: 'address', v: args['creator'] },
    { t: 'uint256', v: args['creationFee'] },
    { t: 'uint256', v: args['entryFee'] },
    { t: 'uint8', v: args['contestIdType'] },      
    { t: 'uint8', v: args['platformCut'] },      
    { t: 'uint8', v: args['creatorCut'] },      
    { t: 'uint32', v: args['maxParticipants'] },      
    { t: 'bool', v: args['isGuaranteed'] },
    { t: 'bytes', v: args['selectedGames'] },
    // add chainID and Contract to order hash
    { t: 'uint256', v: args['chainId'] },
    { t: 'address', v: args['verifyingContract'] },
  );
}

const createEntryHash = (args) => {
  return soliditySha3(
    { t: 'address', v: args['sender'] },
    { t: 'uint256', v: args['contestHash'] },
    { t: 'uint256', v: args['entryFee'] },
    { t: 'bytes', v: args['draftedPlayers'] },
    // add chainID and Contract to order hash
    { t: 'uint256', v: args['chainId'] },
    { t: 'address', v: args['verifyingContract'] },
  );
}

const claimRewardHash = (args) => {
  return soliditySha3(
    { t: 'address', v: args['sender'] },
    { t: 'uint256', v: args['claimedAmount'] },
    { t: 'bytes', v: args['entryHashArr'] },
    // add chainID and Contract to order hash
    { t: 'uint256', v: args['chainId'] },
    { t: 'address', v: args['verifyingContract'] },
  );
}

describe('DFSManager', function (accounts) {

  let owner, admin, someone, anotherone, feeCollector;
  let pks = {};

  before(async function() {

    [ owner, admin, someone, anotherone, feeCollector, depositorRole ] = await web3.eth.getAccounts();

    /// fill primary keys used for signatures
    pks[admin] = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    pks[someone] = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
    pks[anotherone] = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';

    /// Create reserve contract and add a depositor role for minting
    this.reserveToken = await TSXChild.new({ from: owner });
    this.reserveToken.setDepositor(depositorRole, { from: owner });
    
    // mint tokens to test accounts 
    const fundAmount = toWei('100', 'ether');

    await this.reserveToken.deposit(
      someone, web3.eth.abi.encodeParameter('uint256', fundAmount), { 
        from: depositorRole 
      }
    );

    await this.reserveToken.deposit(
      anotherone, web3.eth.abi.encodeParameter('uint256', fundAmount), { 
        from: depositorRole 
      }
    );

    // create ContestStorage & entry Storage contracts
    this.contestStorage = await ContestStorage.new({ from: owner });
    this.entryStorage = await EntryStorage.new({ from: owner });

    // create DFSManager
    this.dsfManager = await DFSManager.new(
      this.reserveToken.address,
      this.entryStorage.address,
      this.contestStorage.address, 
      { 
        from: owner 
      }
    );

    // sets storages' operation manager
    await this.contestStorage.setOperationManager(this.dsfManager.address, { from: owner });
    await this.entryStorage.setOperationManager(this.dsfManager.address, { from: owner });

    // sets DFSManager's admin and Fee collector addr.
    await this.dsfManager.setAdminAddress(admin, { from: owner });
    await this.dsfManager.setFeeCollector(feeCollector, { from: owner });
  });

  describe("Tests contests create", function () {
    
    it("Creates a contest", async function () {

      const createContestArgs = {
        'creator': someone,
        'creationFee': toWei('100', 'ether'),
        'entryFee': toWei('10', 'ether'),
        'contestIdType': 0,
        'platformCut': 10,
        'creatorCut': 10,
        'maxParticipants': 50,
        'participantsCount': 0,
        'isGuaranteed': true,
        'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002")
      };
      
      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dsfManager.address
      }
      
      const contestHash = createContestHash(
        { ...createContestArgs, ...signatureParams }
      );
      
      const orderAdminSignature = await createSignature(contestHash, admin);  

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address,      // The token contract address
        createContestArgs.creationFee,  // tokens amount
        this.dsfManager.address,        // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // Sign EIP712 transfer order
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[someone]), { data: typedData }
      );

      /// balance trackers

      const creatorBalanceTracker = await balanceSnap(
        this.reserveToken, someone, 'someones\s reserve balance'
      );

      const vaultBalanceTracker = await balanceSnap(
        this.reserveToken, this.dsfManager.address, 'vault\s reserve balance'
      );

      const feeCollectorTracker = await balanceSnap(
        this.reserveToken, feeCollector, 'fees collector reserve balance'
      );

      await this.dsfManager.createContest(
        createContestArgs,
        // admin signature
        orderAdminSignature, 
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature, 
        { 
          from: someone 
        }
      );

      /// check balance of sender
      await creatorBalanceTracker.requireDecrease(
        toBN(createContestArgs.creationFee) // amount decrease in reserve
      );

      await feeCollectorTracker.requireIncrease(
        toBN(createContestArgs.creationFee) // amount increase in reserve
      );
    })

    it("reverts if admin signature fails", async function () {

      const creationFee=20
      const entryFee=10
      const selectedGames="0x2233373635342c203132333231332c2031323331323322"
      const maxParticipants=50
      const contestIdType=2
      const platformCut=10
      const creatorCut=10

      const createContestArgs = {
        'sender': operationManager,
        'creationFee': creationFee,
        'entryFee': entryFee,
        'selectedGames': selectedGames,
        'maxParticipants': maxParticipants,
        'contestIdType': contestIdType,
        'platformCut': platformCut,
        'creatorCut': creatorCut,
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dsfManager.address
      };
  
      const contestHash = createContestHash(createContestArgs);
      const orderNotAdminSignature = await createSignature(contestHash, someone);  

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        entryFee,  // tokens amount
        this.dsfManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        operationManager // from address included in the EIP712signature
      );

      // PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[operationManager]), { data: typedData }
          );
  
      await expectRevert(this.dsfManager.createContest(
          creationFee, 
          entryFee, 
          selectedGames,
          maxParticipants,
          contestIdType,
          platformCut,
          creatorCut,
          orderNotAdminSignature,
          // EIP712.
          orderExpiration,
          orderId,
          eip712TransferSignature,
          { 
            from: operationManager 
          }
        ),"createEntry() - invalid admin signature")

      // WIP Check transfer Fee to DFSManager 

      //Check Fee collector balance after sending fees
      v = await this.reserveToken.balanceOf(feeCollector)
      expect(v, "creationFee not sent").to.be.eq.BN(0);
    })

  })

  describe("Tests contests edits", function () {
  })

  describe("Tests contests entries", function () {
    it("should create entry", async function () {

      const entryFee=toBN(10000)
      const draftedPlayers="0x91DDCC41B761ACA928C62F7B0DA61DC763255E8247E0BD8DCE6B22205197154D"
  
      const createEntryArgs = {
          'sender': someone,
          'contestHash': this.createdContestHash,
          'entryFee': entryFee,
          'draftedPlayers': draftedPlayers,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.dsfManager.address
      };
  
      const entryHash = createEntryHash(createEntryArgs);
      const orderAdminSignature = await createSignature(entryHash, admin);   
      
      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        entryFee,  // tokens amount
        this.dsfManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[someone]), { data: typedData }
          );  
  
      const tx = await this.dsfManager.createContestEntry(
        this.createdContestHash, 
        entryFee, 
        draftedPlayers, 
        orderAdminSignature, 
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature,
        { 
          from: someone 
        }
      )

      // Check balance after sending fees

      //Check Fee collector balance after sending fees
      v = await this.reserveToken.balanceOf(feeCollector)
      expect(v, "creationFee sent to feeCollector").to.be.eq.BN(10);

      //Check creator cut balance after sending fees
      v = await this.reserveToken.balanceOf(operationManager)
      expect(v, "creationFee sent to operationManager").to.be.eq.BN(10);      
    })

    it("sould revert if signature fails", async function () {
      const entryFee=toBN(10000)
      const draftedPlayers="0x91DDCC41B761ACA928C62F7B0DA61DC763255E8247E0BD8DCE6B22205197154D"
  
      const createEntryArgs = {
          'sender': someone,
          'contestHash': this.createdContestHash,
          'entryFee': entryFee,
          'draftedPlayers': draftedPlayers,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.dsfManager.address
      };
      const entryHash = createEntryHash(createEntryArgs);
      const orderSomeoneSignature = await createSignature(entryHash, someone);  

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        entryFee,  // tokens amount
        this.dsfManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[someone]), { data: typedData }
          );
  
      await expectRevert(
        this.dsfManager.createContestEntry(
          this.createdContestHash, 
          entryFee, 
          draftedPlayers, 
          orderSomeoneSignature, 
          // EIP712.
          orderExpiration,
          orderId,
          eip712TransferSignature,
          { 
            from: someone 
          }
        ), "createEntry() - invalid admin signature");      
    })
  })

  describe("Tests contests claiming", function () {
    
    it("claims OK", async function () {
      const claimedAmount=toBN(10000)
      const claimRewardArgs = {
          'sender': someone,  
          'claimedAmount': claimedAmount,
          'entryHashArr': this.createdEntryHash,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.dsfManager.address
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderAdminSignature = await createSignature(rewardHash, admin);   
      
      const tx = await this.dsfManager.claimContesEntry(
        claimedAmount, 
        [this.createdEntryHash], 
        orderAdminSignature, 
        { 
          from: someone 
        }        
      )
      
      //Check sent rewards
      v = await this.reserveToken.balanceOf(someone)

      expect(v, "reward sent to someonne").to.be.eq.BN(claimedAmount);   
    })

    it("reverts if admins' signature fails", async function () {

      const claimedAmount=toBN(10000)
  
      const claimRewardArgs = {
          'sender': someone,  
          'claimedAmount': claimedAmount,
          'entryHashArr': this.createdEntryHash,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.dsfManager.address
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderSomeoneSignature = await createSignature(rewardHash, someone);   
      
      await expectRevert(
        this.dsfManager.claimContesEntry(
          claimedAmount, 
          [this.createdEntryHash], 
          orderSomeoneSignature,
          { 
            from: someone 
          }        
        ), "claimReward() - invalid admin signature");         
    })
  })

});