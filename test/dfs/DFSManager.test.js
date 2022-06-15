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

    [ owner, admin, someone, anotherone, feeCollector, depositorRole, newDFSManager ] = await web3.eth.getAccounts();

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

    // create DFSManager
    this.dsfManager = await DFSManager.new(
      this.reserveToken.address,
      this.contestStorage.address, 
      { 
        from: owner 
      }
    );

    // sets storages' operation manager
    await this.contestStorage.setOperationManager(this.dsfManager.address, { from: owner });

    // sets DFSManager's admin and Fee collector addr.
    await this.dsfManager.setAdminAddress(admin, { from: owner });
    await this.dsfManager.setFeeCollector(feeCollector, { from: owner });
    
  });

  describe("Tests contests create", function () {
    
    it("Creates a contest", async function () {

      // const createContestArgs = {
      //   'creator': someone,
      //   'creationFee': toWei('100', 'ether'),
      //   'entryFee': toWei('10', 'ether'),
      //   'contestIdType': 0,
      //   'platformCut': 10,
      //   'creatorCut': 10,
      //   'maxParticipants': 50,
      //   'participantsCount': 0,
      //   'isGuaranteed': true,
      //   'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002")
      // };
      
      // const signatureParams = {
      //   'chainId': await web3.eth.net.getId(),
      //   'verifyingContract' : this.dsfManager.address
      // }

      // const contestHash = createContestHash(
      //   { ...createContestArgs, ...signatureParams }
      // );
      
      const createContestArgs = {
        'creator': "0x15275bB074f864a66D86440D452Ea58d6627F8f2",
        'creationFee': "100000000000000000000",
        'entryFee': "100000000000000000000",
        'contestIdType': 2,
        'platformCut': 10,
        'creatorCut': 5,
        'maxParticipants': 10,
        'participantsCount': 0,
        'isGuaranteed': true,
        'selectedGames': web3.eth.abi.encodeParameter('string', "36821"),
        'chainId': 80001,
        'verifyingContract': "0xd7b809afCE0C1AD9b3Cb80267D8014241c684A88"
      };

      const h = createContestHash(createContestArgs);

      console.log(createContestArgs);
      console.log(h);

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
        'creationFee': toWei('100', 'ether'),
        'entryFee': toWei('10', 'ether'),
        'contestIdType': 0,
        'platformCut': 10,
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
      const draftedPlayers="0x91DDCC41B761ACA928C62F7B0DA61DC763255E8247E0BD8DCE6B22205197154D"

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

      const entryFee=toWei('10', 'ether')
      const draftedPlayers="0x91DDCC41B761ACA928C62F7B0DA61DC763255E8247E0BD8DCE6B22205197154D"

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
  

      const creatorBalanceTracker = await balanceSnap(
        this.reserveToken, someone, 'someones\s reserve balance'
      );

      const dfsManagerBalanceTracker = await balanceSnap(
        this.reserveToken, this.dsfManager.address, 'someones\s reserve balance'
      );      

      const tx = await this.dsfManager.createContestEntry(
        createdContestHash, 
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

      // check balance of sender
      await creatorBalanceTracker.requireDecrease(
        toBN(createEntryArgs.entryFee) // amount decrease in reserve
      );     

      /// check balance of dfsManager
      await dfsManagerBalanceTracker.requireIncrease(
        toBN(createEntryArgs.entryFee) // amount increase in reserve
      );      

    })    

    it("should edit entry for created contest", async function () {

    })

    it("should fail edit entry if check sign fails", async function () {

    })    

  })

  describe("Tests contest migrateReserve", function () {
    it("migrateReserve should transfer balance to new DFSManager", async function () {
  
      balanceToMigrate = await this.reserveToken.balanceOf(this.dsfManager.address)
  
      await this.dsfManager.migrateReserve(newDFSManager);
  
      newDFSManagerBalance = await this.reserveToken.balanceOf(newDFSManager)
      oldDFSManagerBalance = await this.reserveToken.balanceOf(this.dsfManager.address)
  
      // Check expected behaviour after migration
      
      expect(oldDFSManagerBalance,
      "old DFSManager has 0 tokens").to.be.eq.BN(0);
  
      expect(newDFSManagerBalance,
      "new DFSManager has balance").to.be.eq.BN(balanceToMigrate);    
    
    })  
  })

});