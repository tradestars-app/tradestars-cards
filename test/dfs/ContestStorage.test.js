const {
    BN, // big number
    time, // time helpers
    expectEvent, // Assertions for emitted events
    expectRevert, // Assertions for transactions that should fail
  } = require('@openzeppelin/test-helpers')
    
const { toBN, toWei, fromWei, soliditySha3 } = require('web3-utils');

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

/// Used artifacts
const ContestStorage = artifacts.require('ContestStorage');

describe('ContestStorage', function () {

  let owner, someone, anotherone, allowedOpManager;

  const contestArgs = {
    'entryFee': toWei('10', 'ether'),
    'startTime': 0,
    'endTime': 0,
    'isGuaranteed': true,
    'contestIdType': 0,
    'maxDraftsPerParticipant': 1,
    'maxParticipants': 2,
    'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002")
  };

  before(async function() {
    [ 
      owner, 
      someone, 
      anotherone, 
      allowedOpManager, 
      participantA, 
      participantB, 
      participantC 
    ] = await web3.eth.getAccounts();

    /// Create and initialize a ContestStorage
    this.contract = await ContestStorage.new({ from: owner });
    
    /// Sets allowed caller
    await this.contract.setOperationManager(
      allowedOpManager, { from: owner }
    );
  });

  /// CONTESTS ABM

  describe('createContest()', function() {
    it(`Fails create - not OpManager`, async function() {
      await expectRevert(
        this.contract.createContest(
          someone,
          contestArgs,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });
    it(`Fails create - invalid startTime`, async function() {
      await expectRevert(
        this.contract.createContest(
          someone,
          contestArgs,
          {
            from: allowedOpManager 
          }
        ),
        "createContest() - invalid startTime"
      );
    });
    it(`Creates OK`, async function() {
      const now = await time.latest();
  
      contestArgs.startTime = now.add(time.duration.minutes(5)).toString(); // adds 5 min
      contestArgs.endTime = now.add(time.duration.minutes(10)).toString(); // adds 10 min
  
      const tx = await this.contract.createContest(
        someone,
        contestArgs,
        {
          from: allowedOpManager 
        }
      );
  
      // TODO: Check detailed the formatting.
      expectEvent(tx, 'CreateContest', { 
        'creator': someone,
        'contestArgs': [ 
          contestArgs.entryFee,
          `${contestArgs.startTime}`,
          `${contestArgs.endTime}`,
          contestArgs.isGuaranteed,
          `${contestArgs.contestIdType}`,
          `${contestArgs.maxDraftsPerParticipant}`,
          `${contestArgs.maxParticipants}`,
          contestArgs.selectedGames,
        ],
      });
    });
  });

  describe('getContestData()', function() {
    it(`Fails to get - invalid contest hash`, async function() {
      const contestNonce = 0;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      
      await expectRevert(
        this.contract.getContestData(contestHash),
        "_getContestInfoStorageByHash() - invalid contest hash"
      );
    });
    it(`Gets OK`, async function() {
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      
      const { creator, entryFee } = await this.contract.getContestData(contestHash);
      
      // check event values OK
      expect(creator).to.equal(someone);
      expect(entryFee).to.eq.BN(contestArgs.entryFee);
    });
  });

  describe('editContest()', function() {
    it(`Fails edit - non OpManager`, async function() {
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      
      await expectRevert(
        this.contract.editContest(
          someone,
          contestHash,
          contestArgs,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });
    it(`Fails edit - invalid owner`, async function() {
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      await expectRevert(
        this.contract.editContest(
          anotherone,
          contestHash,
          contestArgs,
          {
            from: allowedOpManager 
          }
        ),
        "EditContest() - invalid owner"
      );
    });
    it(`Fails edit - invalid start time`, async function() {
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      
      const now = await time.latest();

      contestArgs.startTime = now.toString(); // adds 5 min
      contestArgs.endTime = now.toString(); // adds 10 min

      await expectRevert(
        this.contract.editContest(
          someone,
          contestHash,
          contestArgs,
          {
            from: allowedOpManager 
          }
        ),
        "EditContest() - invalid startTime"
      );
    });
    it(`Fails edit - contest has entries`, async function() {
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");
      
      await this.contract.addEntry(
        participantA,
        contestHash,
        draftedPlayers,
        {
          from: allowedOpManager 
        }
      );

      await expectRevert(
        this.contract.editContest(
          someone,
          contestHash,
          contestArgs,
          {
            from: allowedOpManager 
          }
        ),
        "EditContest() - contest has entries"
      );
    });
    it(`Fails edit - contest started`, async function() {
      const now = await time.latest();
  
      contestArgs.startTime = now.add(time.duration.minutes(5)).toString(); // adds 5 min
      contestArgs.endTime = now.add(time.duration.minutes(10)).toString(); // adds 10 min

      await this.contract.createContest(
        someone,
        contestArgs,
        {
          from: allowedOpManager 
        }
      );

      // increases time
      await time.increase(5 * 60); // increase 5 mins
      
      const contestNonce = 2;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      await expectRevert(
        this.contract.editContest(
          someone,
          contestHash,
          contestArgs,
          {
            from: allowedOpManager 
          }
        ),
        "EditContest() - contest started"
      );
    });
    it(`Edits OK`, async function() {      
      const now = await time.latest();
  
      contestArgs.startTime = now.add(time.duration.minutes(5)).toString(); // adds 5 min
      contestArgs.endTime = now.add(time.duration.minutes(10)).toString(); // adds 10 min

      await this.contract.createContest(
        someone,
        contestArgs,
        {
          from: allowedOpManager 
        }
      );
        
      const contestNonce = 3;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      // new args
      contestArgs.startTime = now.add(time.duration.minutes(25)).toString(); // adds 5 min
      contestArgs.endTime = now.add(time.duration.minutes(30)).toString(); // adds 10 min
      contestArgs.contestIdType = 1;
            
      const tx = await this.contract.editContest(
        someone, 
        contestHash,
        contestArgs,
        {
          from: allowedOpManager 
        }
      );
  
      expectEvent(tx, 'EditContest', { 
        'creator': someone,
        'contestHash': contestHash,
        'contestArgs': [ 
          contestArgs.entryFee,
          `${contestArgs.startTime}`,
          `${contestArgs.endTime}`,
          contestArgs.isGuaranteed,
          `${contestArgs.contestIdType}`,
          `${contestArgs.maxDraftsPerParticipant}`,
          `${contestArgs.maxParticipants}`,
          contestArgs.selectedGames,
        ],
      });
    });
  });

  /// ENTRIES ABM

  describe('addEntry()', function() {
    it(`Fails create - non OpManager`, async function() {
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");

      await expectRevert(
        this.contract.addEntry(
          participantA,
          contestHash,
          draftedPlayers,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );

    });
    it(`Fails create - contest started`, async function() {
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
  
      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");
  
      await expectRevert(
        this.contract.addEntry(
          participantA,
          contestHash,
          draftedPlayers,
          {
            from: allowedOpManager 
          }
        ),
        "addEntry() - contest started"
      );
    });
    it(`Fails create - max drafts limit`, async function() {      
      const contestNonce = 3;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");

      await this.contract.addEntry(
        participantA,
        contestHash,
        draftedPlayers,
        {
          from: allowedOpManager 
        }
      );

      await expectRevert(
        this.contract.addEntry(
          participantA,
          contestHash,
          draftedPlayers,
          {
            from: allowedOpManager 
          }
        ),
        "addEntry() - draft limit"
      );
    });
    it(`Fails create - contest full`, async function() {      
      const contestNonce = 3;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");

      await this.contract.addEntry(
        participantB,
        contestHash,
        draftedPlayers,
        {
          from: allowedOpManager 
        }
      );

      await expectRevert(
        this.contract.addEntry(
          participantC,
          contestHash,
          draftedPlayers,
          {
            from: allowedOpManager 
          }
        ),
        "addEntry() - contest full"
      );
    });
    it(`Creates OK`, async function() {
      await this.contract.createContest(
        someone,
        contestArgs,
        {
          from: allowedOpManager 
        }
      );

      const contestNonce = 4;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
  
      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");
  
      const tx = await this.contract.addEntry(
        participantA,
        contestHash,
        draftedPlayers,
        {
          from: allowedOpManager 
        }
      );
      
      // TODO: Check detailed the formatting.
      expectEvent(tx, 'CreateEntry', { 
        'contestHash': contestHash,
        'participant': participantA,
        'draftedPlayers': draftedPlayers,
      });
    });
  });

  describe('editEntry()', function() {
    it(`Fails to edit - non OpManager`, async function() {
      const contestNonce = 4;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const entryNonce = 4;
      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'uint256', v: entryNonce }, 
      );

      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");

      await expectRevert(
        this.contract.editEntry(
          participantA,
          entryHash,
          contestHash,
          draftedPlayers,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });
    it(`Fails to edit - invalid owner`, async function() {
      const contestNonce = 4;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const entryNonce = 4;
      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");

      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'bytes', v: draftedPlayers },
        { t: 'uint256', v: entryNonce }, 
      );

      await expectRevert(
        this.contract.editEntry(
          participantB,
          entryHash,
          contestHash,
          draftedPlayers,
          {
            from: allowedOpManager 
          }
        ),
        "editEntry(): invalid owner"
      );
    });
    it(`Fails to edit - contest started`, async function() {
      const contestNonce = 4;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const entryNonce = 4;
      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'uint256', v: entryNonce }, 
      );

      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");

      // increases time
      await time.increase(25 * 60); // increase 5 mins

      await expectRevert(
        this.contract.editEntry(
          participantA,
          entryHash,
          contestHash,
          draftedPlayers,
          {
            from: allowedOpManager 
          }
        ),
        "editEntry() - contest started"
      );
    });
    it(`Edits OK`, async function() {
      
      const contestNonce = 5;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const now = await time.latest();
  
      contestArgs.startTime = now.add(time.duration.minutes(5)).toString(); // adds 5 min
      contestArgs.endTime = now.add(time.duration.minutes(10)).toString(); // adds 10 min

      await this.contract.createContest(
        someone,
        contestArgs,
        {
          from: allowedOpManager 
        }
      );

      const entryNonce = 5;      
      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'uint256', v: entryNonce }, 
      );

      const draftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0002");

      await this.contract.addEntry(
        participantA,
        contestHash,
        draftedPlayers,
        {
          from: allowedOpManager 
        }
      );

      const newDraftedPlayers = web3.eth.abi.encodeParameter('string', "0004|0005");

      const tx = await this.contract.editEntry(
        participantA,
        entryHash,
        contestHash,
        newDraftedPlayers,
        {
          from: allowedOpManager 
        }
      );

      // TODO: Check detailed the formatting.
      expectEvent(tx, 'EditEntry', { 
        'entryHash': entryHash,
        'contestHash': contestHash,
        'participant': participantA,
        'draftedPlayers': newDraftedPlayers,
      });
    });
  });

  describe('claimEntry()', function() {
    it(`Fails to claim - non OpManager`, async function() { 
      const contestNonce = 5;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const entryNonce = 5;
      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'uint256', v: entryNonce }, 
      );
      
      await expectRevert(
        this.contract.claimEntry(
          participantA,
          entryHash,
          {
            from: anotherone
          }
        ),
        "caller is not allowed"
      );
    });
    it(`Fails to claim - invalid owner`, async function() {
      const contestNonce = 5;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const entryNonce = 5;
      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'uint256', v: entryNonce }, 
      );
      
      await expectRevert(
        this.contract.claimEntry(
          participantB,
          entryHash,
          {
            from: allowedOpManager
          }
        ),
        "claimEntry(): invalid owner"
      );      
    });
    it(`Claims OK`, async function() {
      const contestNonce = 5;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const entryNonce = 5;
      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'uint256', v: entryNonce }, 
      );
      
      const tx = await this.contract.claimEntry(
        participantA,
        entryHash,
        {
          from: allowedOpManager
        }
      );

      expectEvent(tx, 'ClaimEntry', { 
        'participant': participantA,
        'entryHash': entryHash,
      });
    });
    it(`Fails to claim - already claimed`, async function() {
      const contestNonce = 5;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const entryNonce = 5;
      const entryHash = soliditySha3(
        { t: 'address', v: participantA },
        { t: 'bytes32', v: contestHash },
        { t: 'uint256', v: entryNonce }, 
      );
      
      await expectRevert(
        this.contract.claimEntry(
          participantA,
          entryHash,
          {
            from: allowedOpManager
          }
        ),
        "claimEntry(): already claimed"
      );   
    });
  });
});
