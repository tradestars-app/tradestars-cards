const { 
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const {toWei, toBN, soliditySha3 } = require('web3-utils');

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

const ethSign = require('eth-sig-util');
const { getOrderTypedData } = require('../helpers/eip712utils');

const { toBuffer } = require('ethereumjs-util');
const { randomBytes } = require('crypto');

const ERC20 = artifacts.require('MockERC20');
const DFSManager = artifacts.require('DFSManager');
const contestStorage = artifacts.require('ContestStorage')
const entryStorage = artifacts.require('EntryStorage')

contract('DFSManager', function (accounts) {

  const [owner, admin, operationManager, feeCollector, someone, anotherone ] = accounts;
  let pks = {};
  pks[operationManager] = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';  
  pks[someone] = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab375b';  

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
      { t: 'bytes', v: args['sender'] },
      { t: 'uint256', v: args['creationFee'] },
      { t: 'uint256', v: args['entryFee'] },
      { t: 'bytes', v: args['selectedGames'] },
      { t: 'uint32', v: args['maxParticipants'] },      
      { t: 'uint8', v: args['contestIdType'] },      
      { t: 'uint8', v: args['platformCut'] },      
      { t: 'uint8', v: args['creatorCut'] },      
      // add chainID and Contract to order hash
      { t: 'uint256', v: args['chainId'] },
      { t: 'address', v: args['verifyingContract'] },
    );
  }

  const createEntryHash = (args) => {
    return soliditySha3(
      { t: 'bytes', v: args['sender'] },
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
      { t: 'bytes', v: args['sender'] },
      { t: 'uint256', v: args['claimedAmount'] },
      { t: 'bytes', v: args['entryHashArr'] },
      // add chainID and Contract to order hash
      { t: 'uint256', v: args['chainId'] },
      { t: 'address', v: args['verifyingContract'] },
    );
  }  

  beforeEach(async function () {

      this.token = await ERC20.new();

      // create ContestStorage & set operation manager
      this.contestStorage = await contestStorage.new()

      // set operation manager
      await this.contestStorage.setOperationManager(
        operationManager,
        {
          from:owner
        }
      )

      // create Contest
      tx = await this.contestStorage.createContest(
        operationManager, "0x2233373635342c203132333231332c2031323331323322", toBN(10000), 50, 2, 10, 10,
        {
          from: operationManager
        }
      )
      this.createdContestHash = tx.logs[0].args.contestHash

      // create EntryStorage
      this.entryStorage = await entryStorage.new()

      // create Entry for contest
      tx = await this.entryStorage.createEntry(
        someone, this.createdContestHash, "0x2233373635342c203132333231332c2031323331323322",
        {
          from: someone
        }
      )
      this.createdEntryHash = tx.logs[0].args.entryHash   

      // create DFSManager
      this.DFSManager = await DFSManager.new(
        this.token.address,
        this.entryStorage.address,
        this.contestStorage.address
      );

      // mint tokens to contract address
      const initialSupply = toBN(10000)
      await this.token.mint(this.DFSManager.address, initialSupply);

      // set admin address
      await this.DFSManager.setAdminAddress(
        admin
      );      

      // set fee collector address
      await this.DFSManager.setFeeCollector(
        feeCollector
      );

  })

  describe("createContest", function () {
    it("createContest should create contest, and transfer creation fee", async function () {

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
        'verifyingContract' : this.DFSManager.address
      };
  
      const contestHash = createContestHash(createContestArgs);
      const orderAdminSignature = await createSignature(contestHash, admin);  

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.token.address, /// The token contract address
        entryFee,  // tokens amount
        this.DFSManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        operationManager // from address included in the EIP712signature
      );

      // PK for msgSender
       const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[operationManager]), { data: typedData }
          );
  
      // set operation manager
      await this.contestStorage.setOperationManager(
        this.DFSManager.address,
        {
          from: owner
        }
      )

      await this.DFSManager.createContest(
          creationFee, 
          entryFee, 
          selectedGames,
          maxParticipants,
          contestIdType,
          platformCut,
          creatorCut,
          orderAdminSignature,
          // EIP712.
          orderExpiration,
          orderId,
          eip712TransferSignature,
          { 
            from: operationManager 
          }
        )

      // WIP Check transfer Fee to DFSManager 

      //Check Fee collector balance after sending fees
      v = await this.token.balanceOf(feeCollector)
      expect(v, "creationFee sent to feeCollector").to.be.eq.BN(creationFee);
              

    })

    it("createContest should revert if it check signature fails ", async function () {

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
        'verifyingContract' : this.DFSManager.address
      };
  
      const contestHash = createContestHash(createContestArgs);
      const orderNotAdminSignature = await createSignature(contestHash, someone);  

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.token.address, /// The token contract address
        entryFee,  // tokens amount
        this.DFSManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        operationManager // from address included in the EIP712signature
      );

      // PK for msgSender
       const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[operationManager]), { data: typedData }
          );
  
      await expectRevert(this.DFSManager.createContest(
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
      v = await this.token.balanceOf(feeCollector)
      expect(v, "creationFee not sent").to.be.eq.BN(0);
              
    })

  })

  describe("createContestEntry", function () {
    it("createEntry should transfer fee and emit event", async function () {

      const entryFee=toBN(10000)
      const draftedPlayers="0x91DDCC41B761ACA928C62F7B0DA61DC763255E8247E0BD8DCE6B22205197154D"
  
      const createEntryArgs = {
          'sender': someone,
          'contestHash': this.createdContestHash,
          'entryFee': entryFee,
          'draftedPlayers': draftedPlayers,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.DFSManager.address
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
        this.DFSManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // PK for msgSender
       const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[someone]), { data: typedData }
          );  
  
      const tx = await this.DFSManager.createContestEntry(
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
      v = await this.token.balanceOf(feeCollector)
      expect(v, "creationFee sent to feeCollector").to.be.eq.BN(10);

      //Check creator cut balance after sending fees
      v = await this.token.balanceOf(operationManager)
      expect(v, "creationFee sent to operationManager").to.be.eq.BN(10);      
              

    })
    it("createContestEntry should revert if check signature fails", async function () {
      const entryFee=toBN(10000)
      const draftedPlayers="0x91DDCC41B761ACA928C62F7B0DA61DC763255E8247E0BD8DCE6B22205197154D"
  
      const createEntryArgs = {
          'sender': someone,
          'contestHash': this.createdContestHash,
          'entryFee': entryFee,
          'draftedPlayers': draftedPlayers,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.DFSManager.address
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
        this.DFSManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // PK for msgSender
       const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[someone]), { data: typedData }
          );
  
      await expectRevert(
        this.DFSManager.createContestEntry(
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

  describe("claimContesEntry", function () {
    it("claimContesEntry should send rewards and emit event", async function () {

      const claimedAmount=toBN(10000)
  
      const claimRewardArgs = {
          'sender': someone,  
          'claimedAmount': claimedAmount,
          'entryHashArr': this.createdEntryHash,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.DFSManager.address
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderAdminSignature = await createSignature(rewardHash, admin);   
      
      const tx = await this.DFSManager.claimContesEntry(
        claimedAmount, 
        [this.createdEntryHash], 
        orderAdminSignature, 
        { 
          from: someone 
        }        
      )
      
      //Check sent rewars
      v = await this.token.balanceOf(someone)
      expect(v, "reward sent to someonne").to.be.eq.BN(claimedAmount);      
              
    })
    it("claimContesEntry should revert if check signature fails", async function () {

      const claimedAmount=toBN(10000)
  
      const claimRewardArgs = {
          'sender': someone,  
          'claimedAmount': claimedAmount,
          'entryHashArr': this.createdEntryHash,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.DFSManager.address
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderSomeoneSignature = await createSignature(rewardHash, someone);   
      
      await expectRevert(
        this.DFSManager.claimContesEntry(
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