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
const { runInThisContext } = require('vm');

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
    { t: 'address', v: args['creator'] },
    { t: 'uint256', v: args['contestHash'] },
    { t: 'uint256', v: args['entryFee'] },
    { t: 'bytes', v: args['draftedPlayers'] },
    // add chainID and Contract to order hash
    { t: 'uint256', v: args['chainId'] },
    { t: 'address', v: args['verifyingContract'] },
  );
}

const editEntryHash = (args) => {
  return soliditySha3(
    { t: 'address', v: args['creator'] },
    { t: 'uint256', v: args['entryHash'] },
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
    const fundAmount = toWei('1000', 'ether');

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
    
    // Contest & entry params
    this.creationFee = toWei('100', 'ether')
    this.entryFee = toWei('10', 'ether')
    this.transferFee = toWei('2', 'ether')
    this.platformCut = 10
    this.creatorCut = 10
    this.mathPrecision = 10000 
  });

  describe("Tests contests create", function () {
    
    it("Creates a contest", async function () {

      const createContestArgs = {
        'creator': someone,
        'creationFee': this.creationFee,
        'entryFee': this.entryFee,
        'contestIdType': 0,
        'platformCut': this.platformCut,
        'creatorCut': this.creatorCut,
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
        toBN(this.creationFee) // amount decrease in reserve
      );

      await feeCollectorTracker.requireIncrease(
        toBN(this.creationFee) // amount increase in reserve
      );
    })

    it("reverts if admin signature fails", async function () {

      const createContestArgs = {
        'creator': someone,
        'creationFee': this.creationFee,
        'entryFee': this.entryFee,
        'contestIdType': 0,
        'platformCut': this.platformCut,
        'creatorCut': this.creatorCut,
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
        this.reserveToken.address,   // The token contract address
        createContestArgs.creationFee,  // tokens amount
        this.dsfManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // Sign EIP712 transfer order
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[someone]), { data: typedData }
      );

      invalidContestArgs = {
        'creator': someone,
        'creationFee': this.creationFee,
        'entryFee': this.entryFee,
        'contestIdType': 0,
        'platformCut': this.platformCut,
        'creatorCut': 20, // Diferent creator cut. Check sig will fail
        'maxParticipants': 50,
        'participantsCount': 0,
        'isGuaranteed': true,
        'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002")        
      }

      await expectRevert(this.dsfManager.createContest(
        invalidContestArgs,
        // admin signature
        orderAdminSignature, 
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature, 
        { 
          from: someone 
        }
      ),"createEntry() - invalid admin signature");

    })

    it("should fail create entry if check sign fails", async function (){
      const entryFee=toWei('10', 'ether')
      const draftedPlayers=web3.eth.abi.encodeParameter('string', "0001|0002")

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );      
  
      const createEntryArgs = {
          'creator': someone,
          'contestHash': createdContestHash,
          'entryFee': entryFee,
          'draftedPlayers': draftedPlayers,
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dsfManager.address
      }
      
      const entryHash = createEntryHash(
        { ...createEntryArgs, ...signatureParams }
      );      
  
      const orderInvalidSignature = await createSignature(entryHash, anotherone);   
      
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
  

      await expectRevert(this.dsfManager.createContestEntry(
        createdContestHash, 
        entryFee, 
        draftedPlayers, 
        orderInvalidSignature, 
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature,
        { 
          from: someone 
        }
      ),"revert")

    })

    it("should create entry for created contest", async function () {

      const draftedPlayers=web3.eth.abi.encodeParameter('string', "0001|0002")

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );      
  
      const createEntryArgs = {
          'creator': anotherone,
          'contestHash': createdContestHash,
          'entryFee': this.entryFee,
          'draftedPlayers': draftedPlayers,
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dsfManager.address
      }
      
      const entryHash = createEntryHash(
        { ...createEntryArgs, ...signatureParams }
      );      
  
      const orderAdminSignature = await createSignature(entryHash, admin);   
      
      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address, /// The token contract address
        this.entryFee,  // tokens amount
        this.dsfManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        anotherone // from address included in the EIP712signature
      );

      // PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[anotherone]), { data: typedData }
          );  
  

      const creatorBalanceTracker = await balanceSnap(
        this.reserveToken, someone, 'someones\s reserve balance'
      );

      const feeCollectorBalanceTracker = await balanceSnap(
        this.reserveToken, feeCollector, 'collector\s reserve balance'
      );      
      
      const playerBalanceTracker = await balanceSnap(
        this.reserveToken, anotherone, 'someones\s reserve balance'
      );            

      const dfsManagerBalanceTracker = await balanceSnap(
        this.reserveToken, this.dsfManager.address, 'someones\s reserve balance'
      );      

      const tx = await this.dsfManager.createContestEntry(
        createdContestHash, 
        this.entryFee, 
        draftedPlayers, 
        orderAdminSignature, 
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature,
        { 
          from: anotherone 
        }
      )

      // PRECISION
      // 10000
      // entry fee
      // 10000000000000000000 10^18
      // ci creator cut
      // 10
      // ci platform cut
      // 10
      // final creator Cut
      // 10000000000000000 10^15
      // final platform Cut
      // 10000000000000000 10^15

      const expectedFeeCollectorIncrease = toBN(this.entryFee) * this.platformCut / this.mathPrecision
      const expectedCreatorIncrease = toBN(this.entryFee) * this.creatorCut / this.mathPrecision
      const expectedDfsManagerIncrease = this.entryFee - toWei('0.02', 'ether')

      // check balance of sender
      await playerBalanceTracker.requireDecrease(
        toBN(this.entryFee) 
      );  

      /// check balance of feeCollector
      await feeCollectorBalanceTracker.requireIncrease(
        toBN(expectedFeeCollectorIncrease) 
      );  

      /// check balance of creator
      await creatorBalanceTracker.requireIncrease(
        toBN(expectedCreatorIncrease) 
      );     

      /// check balance of dfsManager
      await dfsManagerBalanceTracker.requireIncrease(
        toBN(expectedDfsManagerIncrease) 
      );      

    })    

    it("should fail edit entry if check sign fails", async function () {

      const draftedPlayers=web3.eth.abi.encodeParameter('string', "0001|0002")

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: anotherone },
        { t: 'uint256', v: contestNonce }, 
      );      

      const entryNonce = 0;
      this.createdEntryHash = soliditySha3(
        { t: 'address', v: anotherone },
        { t: 'uint256', v: createdContestHash }, 
        { t: 'uint256', v: entryNonce }, 
      );      
  
      const editEntryArgs = {
          'creator': anotherone,
          'entryHash': this.createdEntryHash,
          'draftedPlayers': draftedPlayers,
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dsfManager.address
      }
      
      const entryHash = editEntryHash(
        { ...editEntryArgs, ...signatureParams }
      );      
  
      // Invalid signature
      const orderInvalidSignature = await createSignature(entryHash, someone);   
      
      await expectRevert(this.dsfManager.editContestEntry(
        this.createdEntryHash, 
        draftedPlayers, 
        orderInvalidSignature, 
        { 
          from: anotherone 
        }
      ), "editContestEntry() - invalid admin signature");

    })    


    it("should edit entry for created contest", async function () {

      const draftedPlayers=web3.eth.abi.encodeParameter('string', "0001|0002")

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: anotherone },
        { t: 'uint256', v: contestNonce }, 
      );      

      const entryNonce = 0;
      const createdEntryHash = soliditySha3(
        { t: 'address', v: anotherone },
        { t: 'uint256', v: createdContestHash }, 
        { t: 'uint256', v: entryNonce }, 
      );      
  
      const editEntryArgs = {
          'creator': anotherone,
          'entryHash': createdEntryHash,
          'draftedPlayers': draftedPlayers,
      };

      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dsfManager.address
      }
      
      const entryHash = editEntryHash(
        { ...editEntryArgs, ...signatureParams }
      );      
  
      const orderAdminSignature = await createSignature(entryHash, admin);   
      
      const tx = await this.dsfManager.editContestEntry(
        createdEntryHash, 
        draftedPlayers, 
        orderAdminSignature, 
        { 
          from: anotherone 
        }
      )

    })    


    it("claimContesEntry should send rewards and emit event", async function () {

      const claimedAmount=toBN(10000)
  
      const claimRewardArgs = {
          'sender': anotherone,  
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
          from: anotherone 
        }        
      )
      
      //Check sent rewars
      v = await this.token.balanceOf(anotherone)
      expect(v, "reward sent to someonne").to.be.eq.BN(claimedAmount);      
              
    })
    it("claimContesEntry should revert if check signature fails", async function () {

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

  describe("Tests contest migrateReserve", function () {
    it("migrateReserve should transfer balance to new DFSManager", async function () {
  
      // create new DFSManager to migrate reserve
      this.newDfsManager = await DFSManager.new(
        this.reserveToken.address,
        this.entryStorage.address,
        this.contestStorage.address, 
        { 
          from: owner 
        }
      );

      balanceToMigrate = await this.reserveToken.balanceOf(this.dsfManager.address)
  
      await this.dsfManager.migrateReserve(this.newDfsManager.address);
  
      newDFSManagerBalance = await this.reserveToken.balanceOf(this.newDfsManager.address)
      oldDFSManagerBalance = await this.reserveToken.balanceOf(this.dsfManager.address)
  
      // Check expected behaviour after migration
      
      expect(oldDFSManagerBalance,
      "old DFSManager has 0 tokens").to.be.eq.BN(0);
  
      expect(newDFSManagerBalance,
      "new DFSManager has balance").to.be.eq.BN(balanceToMigrate);    
    
    })  
  })

});