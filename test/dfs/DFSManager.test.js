const { 
  BN, // big number
  time,
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
    { t: 'uint256', v: args['entryFee'] },
    { t: 'uint256', v: args['startTime'] },
    { t: 'uint256', v: args['endTime'] },
    { t: 'bool', v: args['isGuaranteed'] },
    { t: 'bytes', v: args['selectedGames'] },
    { t: 'uint8', v: args['contestIdType'] },      
    { t: 'uint32', v: args['maxParticipants'] },
    { t: 'uint8', v: args['maxDraftsPerParticipant'] },      
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

    [ 
      owner, 
      admin, 
      someone, 
      anotherone, 
      feeCollector, 
      depositorRole
    ] = await web3.eth.getAccounts();

    /// fill primary keys used for signatures
    pks[admin] = '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';
    pks[someone] = '0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a';
    pks[anotherone] = '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6';

    /// Create reserve contract and add a depositor role for minting
    this.reserveToken = await TSXChild.new({ from: owner });
    this.reserveToken.setDepositor(depositorRole, { from: owner });
    
    // mint tokens to test accounts 
    const fundAmount = toWei('1000', 'ether');

    for (const wallet of [someone, anotherone]) {
      await this.reserveToken.deposit(
        wallet, 
        web3.eth.abi.encodeParameter('uint256', fundAmount), 
        { 
          from: depositorRole 
        }
      );
    }

    // create ContestStorage
    this.contestStorage = await ContestStorage.new({ from: owner });

    // create DFSManager
    this.dfsManager = await DFSManager.new(
      this.reserveToken.address,
      this.contestStorage.address, 
      { 
        from: owner 
      }
    );

    // sets storages' operation manager
    await this.contestStorage.setOperationManager(
      this.dfsManager.address, 
      { 
        from: owner 
      }
    );

    // sets admin addr, fee collector & rewardManager
    this.dfsManager.setAdminAddress(admin, { from: owner });
    this.dfsManager.setFeeCollector(feeCollector, { from: owner });
  });

  describe("migrateReserve()", function() {
    it(`Fails - not owner`, async function() {
      await expectRevert(
        this.dfsManager.migrateReserve(
          someone,
          { 
            from: someone
          }
        ), 
        "Ownable: caller is not the owner"
      );
    });
    it(`Migrates OK`, async function() {
      const balanceAmount = toBN('10');

      // mint to contract
      await this.reserveToken.deposit(
        this.dfsManager.address, 
        web3.eth.abi.encodeParameter('uint256', balanceAmount), 
        { 
          from: depositorRole 
        }
      );

      const contractBalance = await balanceSnap(
        this.reserveToken, 
        this.dfsManager.address, 
        'DFSManager balance'
      );

      this.dfsManager.migrateReserve(
        someone, { from: owner }
      );

      contractBalance.requireDecrease(balanceAmount);
    });
  });

  describe("setAdminAddress()", function() {
    it(`Fails - not owner`, async function() {
      await expectRevert(
        this.dfsManager.setAdminAddress(
          admin,
          { 
            from: someone
          }
        ), 
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("setFeeCollector()", function() {
    it(`Fails - not owner`, async function() {
      await expectRevert(
        this.dfsManager.setFeeCollector(
          feeCollector,
          { 
            from: someone
          }
        ), 
        "Ownable: caller is not the owner"
      );    
    });
  });

  describe("setRewardManager()", function() {
    it(`Fails - not owner`, async function() {
      await expectRevert(
        this.dfsManager.setRewardManager(
          someone,
          { 
            from: someone
          }
        ), 
        "Ownable: caller is not the owner"
      );
    });
  });

  describe("createContest()", function() {

    /// This structure should come from abi -> ContestInfo 
    const contestInfo = {
      'entryFee': toWei('10', 'ether'),
      //
      'startTime': 0,
      'endTime': 0,
      //
      'isGuaranteed': true,
      //
      'contestIdType': 0,
      'maxDraftsPerParticipant': 1,
      //
      'maxParticipants': 10,
      //
      'selectedGames': web3.eth.abi.encodeParameter('string', "36821"),
      //
    };

    it(`Fails - invalid admin signature`, async function() {

      const now = await time.latest();

      // set start & end times
      contestInfo.startTime = now.add(time.duration.minutes(5)).toString();
      contestInfo.endTime = now.add(time.duration.minutes(15)).toString();

      const extraParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dfsManager.address
      }
      
      const contestHash = createContestHash(
        { ...contestInfo, ...extraParams }
      );
      
      const orderAdminSignature = await createSignature(
        contestHash, 
        someone // test a non admin signer
      );

      // EIP712
      const orderId = `0x${randomBytes(32).toString('hex')}`; // create a random orderId
      const orderExpiration = Math.floor((new Date()).getTime() / 1000) + 60; // give 60 secs for validity

      const typedData = getOrderTypedData(
        orderId,
        orderExpiration,
        this.reserveToken.address,      // The token contract address
        toWei('10', 'ether'),           // Creation fee in wei amount
        this.dfsManager.address,        // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // Sign EIP712 transfer order
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[someone]), { data: typedData }
      );

      await expectRevert(
        this.dfsManager.createContest(
          contestInfo,
          // admin signature
          orderAdminSignature, 
          // EIP712.
          orderExpiration,
          orderId,
          eip712TransferSignature, 
          { 
            from: anotherone 
          }
        ),
        "createContest() - invalid admin signature"
      );
    });
    it(`Creates OK`, async function() {
      throw new Error("not implemented");
    });
  });

  describe("editContest()", function() {
    it(`Fails - invalid admin signature`, async function() {
      throw new Error("not implemented");
    });
    it(`Creates OK`, async function() {
      throw new Error("not implemented");
    });
  });

  describe("createContestEntry()", function() {
    it(`Fails - invalid admin signature`, async function() {
      throw new Error("not implemented");
    });
    it(`Creates OK`, async function() {
      throw new Error("not implemented");
    });
  });

  describe("editContestEntry()", function() {
    it(`Fails - invalid admin signature`, async function() {
      throw new Error("not implemented");
    });
    it(`Creates OK`, async function() {
      throw new Error("not implemented");
    });
    it(`Fails - reward manager funds`, async function() {
      throw new Error("not implemented");
    });
    it(`Creates OK using rewardManager balance`, async function() {
      throw new Error("not implemented");
    });
  });

  describe("claimContestEntry()", function() {
    it(`Fails - invalid admin signature`, async function() {
      throw new Error("not implemented");
    });
    it(`Creates OK`, async function() {
      throw new Error("not implemented");
    });
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
      //   'verifyingContract' : this.dfsManager.address
      // }

      // const contestHash = createContestHash(
      //   { ...createContestArgs, ...signatureParams }
      // );
      
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
        this.dfsManager.address,        // Spender address is the calling contract that transfer tokens in behalf of the user
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

      const feeCollectorTracker = await balanceSnap(
        this.reserveToken, feeCollector, 'fees collector reserve balance'
      );

      await this.dfsManager.createContest(
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

    it("Reverts contest creation if creator invalid", async function () {

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
        'verifyingContract' : this.dfsManager.address
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
        this.dfsManager.address,        // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // Sign EIP712 transfer order
      const eip712TransferSignature = ethSign.signTypedData(
        toBuffer(pks[someone]), { data: typedData }
      );

      await expectRevert(this.dfsManager.createContest(
        createContestArgs,
        // admin signature
        orderAdminSignature, 
        // EIP712.
        orderExpiration,
        orderId,
        eip712TransferSignature, 
        { 
          from: anotherone 
        }
      ),"createContest() - creator invalid");
    })

    it("Reverts if admin signature fails", async function () {

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
        'verifyingContract' : this.dfsManager.address
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
        this.dfsManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
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

      await expectRevert(this.dfsManager.createContest(
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

    it("Edits created contest", async function(){

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );            

      const editContestArgs = {
        'creator': someone,
        'creationFee': this.creationFee,
        'entryFee': this.entryFee,
        'contestIdType': 0,
        'platformCut': this.platformCut,
        'creatorCut': this.creatorCut,
        'maxParticipants': 10, 
        'participantsCount': 0,
        'isGuaranteed': false,
        'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002|0003")
      };
      
      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dfsManager.address
      }
      
      const contestHash = createContestHash(
        { ...editContestArgs, ...signatureParams }
      );
      
      const orderAdminSignature = await createSignature(contestHash, admin);  

      await this.dfsManager.editContest(
        createdContestHash,
        editContestArgs,
        // admin signature
        orderAdminSignature, 
        { 
          from: someone 
        }
      );
    })

    it("Reverts edit contest if invalid creator", async function(){

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );            

      const editContestArgs = {
        'creator': someone,
        'creationFee': this.creationFee,
        'entryFee': this.entryFee,
        'contestIdType': 0,
        'platformCut': this.platformCut,
        'creatorCut': this.creatorCut,
        'maxParticipants': 10, 
        'participantsCount': 0,
        'isGuaranteed': false,
        'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002|0003")
      };
      
      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dfsManager.address
      }
      
      const contestHash = createContestHash(
        { ...editContestArgs, ...signatureParams }
      );
      
      const orderAdminSignature = await createSignature(contestHash, admin);  

      await expectRevert(this.dfsManager.editContest(
        createdContestHash,
        editContestArgs,
        // admin signature
        orderAdminSignature, 
        { 
          from: anotherone
        }),"createContest() - creator invalid"
        );

    })

    it("Reverts edit contest if invalid signer", async function(){

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );            

      const editContestArgs = {
        'creator': someone,
        'creationFee': this.creationFee,
        'entryFee': this.entryFee,
        'contestIdType': 0,
        'platformCut': this.platformCut,
        'creatorCut': this.creatorCut,
        'maxParticipants': 10, 
        'participantsCount': 0,
        'isGuaranteed': false,
        'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002|0003")
      };
      
      const signatureParams = {
        'chainId' : await web3.eth.net.getId(),
        'verifyingContract' : this.dfsManager.address
      }
      
      const contestHash = createContestHash(
        { ...editContestArgs, ...signatureParams }
      );
      
      const orderAnotherOneSignature = await createSignature(contestHash, anotherone);  

      await expectRevert(this.dfsManager.editContest(
        createdContestHash,
        editContestArgs,
        // another signature
        orderAnotherOneSignature, 
        { 
          from: someone
        }),"editContestEntry() - invalid admin signature"
        );

    })

    it("Reverts create entry if check sign fails", async function (){
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
        'verifyingContract' : this.dfsManager.address
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
        this.dfsManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
        someone // from address included in the EIP712signature
      );

      // PK for msgSender
      const eip712TransferSignature = ethSign.signTypedData(
          toBuffer(pks[someone]), { data: typedData }
          );  
  

      await expectRevert(this.dfsManager.createContestEntry(
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

    it("Create entry for created contest", async function () {

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
        'verifyingContract' : this.dfsManager.address
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
        this.dfsManager.address, // Spender address is the calling contract that transfer tokens in behalf of the user
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
        this.reserveToken, this.dfsManager.address, 'someones\s reserve balance'
      );      

      const tx = await this.dfsManager.createContestEntry(
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

    it("Reverts edit entry if check sign fails", async function () {

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
        'verifyingContract' : this.dfsManager.address
      }
      
      const entryHash = editEntryHash(
        { ...editEntryArgs, ...signatureParams }
      );      
  
      // Invalid signature
      const orderInvalidSignature = await createSignature(entryHash, someone);   
      
      await expectRevert(this.dfsManager.editContestEntry(
        this.createdEntryHash, 
        draftedPlayers, 
        orderInvalidSignature, 
        { 
          from: anotherone 
        }
      ), "editContestEntry() - invalid admin signature");

    })    

    it("Edits entry for created contest", async function () {

      const draftedPlayers=web3.eth.abi.encodeParameter('string', "0001|0002")

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: someone },
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
        'verifyingContract' : this.dfsManager.address
      }
      
      const entryHash = editEntryHash(
        { ...editEntryArgs, ...signatureParams }
      );      
  
      const orderAdminSignature = await createSignature(entryHash, admin);   
      
      const tx = await this.dfsManager.editContestEntry(
        createdEntryHash, 
        draftedPlayers, 
        orderAdminSignature, 
        { 
          from: anotherone 
        }
      )

    })    

    it("Send rewards", async function () {

      const claimedAmount=toWei('0.1', 'ether')

      const contestNonce = 0;
      const createdContestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );   

      const entryNonce = 0;
      const createdEntryHash = soliditySha3(
        { t: 'address', v: anotherone },
        { t: 'uint256', v: createdContestHash }, 
        { t: 'uint256', v: entryNonce }, 
      );         
  
      const claimRewardArgs = {
          'sender': anotherone,  
          'claimedAmount': claimedAmount,
          'entryHashArr': createdEntryHash,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.dfsManager.address
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderAdminSignature = await createSignature(rewardHash, admin);   
      
      const playerBalanceTracker = await balanceSnap(
        this.reserveToken, anotherone, 'someones\s reserve balance'
      );  

      const tx = await this.dfsManager.claimContesEntry(
        claimedAmount, 
        [createdEntryHash], 
        orderAdminSignature, 
        { 
          from: anotherone 
        }        
      )

      // check balance of sender
      await playerBalanceTracker.requireIncrease(
        toBN(claimedAmount) 
      );        
    })

    it("Revert send rewards if check signature fails", async function () {

      const claimedAmount=toBN(10000)
  
      const claimRewardArgs = {
          'sender': someone,  
          'claimedAmount': claimedAmount,
          'entryHashArr': this.createdEntryHash,
          'chainId' : await web3.eth.net.getId(),
          'verifyingContract' : this.dfsManager.address          
      };
  
      const rewardHash = claimRewardHash(claimRewardArgs);
      const orderSomeoneSignature = await createSignature(rewardHash, someone);   
      
      await expectRevert(
        this.dfsManager.claimContesEntry(
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

      balanceToMigrate = await this.reserveToken.balanceOf(this.dfsManager.address)
  
      await this.dfsManager.migrateReserve(this.newDfsManager.address);
  
      newDFSManagerBalance = await this.reserveToken.balanceOf(this.newDfsManager.address)
      oldDFSManagerBalance = await this.reserveToken.balanceOf(this.dfsManager.address)
  
      // Check expected behaviour after migration
      
      expect(oldDFSManagerBalance,
      "old DFSManager has 0 tokens").to.be.eq.BN(0);
  
      expect(newDFSManagerBalance,
      "new DFSManager has balance").to.be.eq.BN(balanceToMigrate);    
    
    })  
  })
});