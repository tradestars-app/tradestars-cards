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

  before(async function() {

    [ owner, someone, anotherone, allowedOpManager ] = await web3.eth.getAccounts();

    /// Create and initialize a ContestStorage
    this.contract = await ContestStorage.new({ from: owner });
  });

  describe('Tests TokenManager admin', function() {

    it(`Sets TokenManager OK`, async function() {
      await this.contract.setOperationManager(allowedOpManager, {
        from: owner
      })
    });

    it(`Fail to set :: not owner`, async function() {
      await expectRevert(
        this.contract.setOperationManager(allowedOpManager, {
          from: someone
        }),
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('ABM Contest', function() {

    const contestArgs = {
      'entryFee': toWei('10', 'ether'),
      'startTime': 0,
      'endTime': 0,
      'isGuaranteed': true,
      'contestIdType': 0,
      'maxDraftsPerParticipant': 5,
      'maxParticipants': 50,
      'selectedGames': web3.eth.abi.encodeParameter('string', "0001|0002")
    };

    it(`Fails create from non op manager`, async function() {
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

    it(`Fails create contest with timestamp < now`, async function() {
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

    it(`Creates contest OK`, async function() {
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

    it(`Gets created contest data by hash OK`, async function() {
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

    it(`Fails edit from non op manager`, async function() {
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

    it(`Edits created contest OK`, async function() {
      
      const now = await time.latest();

      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      // new args
      contestArgs.startTime = now.add(time.duration.minutes(5)).toString(); // adds 5 min
      contestArgs.endTime = now.add(time.duration.minutes(10)).toString(); // adds 10 min
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

    it(`Fails edit by invalid owner`, async function() {
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

    it(`Fails edit - contest started`, async function() {
      
      const contestNonce = 1;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      await time.increase(5 * 60); // increase 5 mins
      
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
  });
});