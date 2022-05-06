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
      'creator': undefined,
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

    it(`Fails create from non op manager`, async function() {
      contestArgs.creator = someone;

      await expectRevert(
        this.contract.createContest(
          contestArgs,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });

    it(`Creates contest OK`, async function() {
      contestArgs.creator = someone;

      const tx = await this.contract.createContest(
        contestArgs,
        {
          from: allowedOpManager 
        }
      );

      // TODO: Check detailed the formatting.
      expectEvent(tx, 'CreateContest', { 
        'contestArgs': [ 
          contestArgs.creator,
          contestArgs.creationFee,
          contestArgs.entryFee,
          `${contestArgs.contestIdType}`,
          `${contestArgs.platformCut}`,
          `${contestArgs.creatorCut}`,
          `${contestArgs.maxParticipants}`,
          `${contestArgs.participantsCount}`,
          contestArgs.isGuaranteed,
          contestArgs.selectedGames,
        ],
      });
    });

    it(`Gets created contest by hash OK`, async function() {
      const contestNonce = 0;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      const obj = await this.contract.getContestByHash(contestHash);
      
      // check event values OK
      expect(obj.creator).to.equal(someone);
      expect(obj.entryFee).to.eq.BN(contestArgs.entryFee);
      expect(obj.maxParticipants).to.eq.BN(contestArgs.maxParticipants);
      expect(obj.contestIdType).to.eq.BN(contestArgs.contestIdType);
      expect(obj.platformCut).to.eq.BN(contestArgs.platformCut);
      expect(obj.creatorCut).to.eq.BN(contestArgs.creatorCut);
      expect(obj.isGuaranteed).to.eq.BN(contestArgs.isGuaranteed);
    });

    it(`Fails edit from non op manager`, async function() {
      const contestNonce = 0;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      
      const newPlatformCut = toBN(0);

      await expectRevert(
        this.contract.editContest(
          someone, 
          contestHash,
          contestArgs.selectedGames,
          contestArgs.entryFee,
          contestArgs.maxParticipants,
          contestArgs.contestIdType,
          newPlatformCut, // contestArgs.platformCut,
          contestArgs.creatorCut,
          contestArgs.isGuaranteed,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });

    it(`Fails edit by invalid owner`, async function() {
      const contestNonce = 0;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      
      const newPlatformCut = toBN(0);

      await expectRevert(
        this.contract.editContest(
          anotherone, 
          contestHash,
          contestArgs.selectedGames,
          contestArgs.entryFee,
          contestArgs.maxParticipants,
          contestArgs.contestIdType,
          newPlatformCut, // contestArgs.platformCut,
          contestArgs.creatorCut,
          contestArgs.isGuaranteed,
          {
            from: allowedOpManager 
          }
        ),
        "EditContest() - invalid owner"
      );
    });

    it(`Edits created contest OK`, async function() {
      const contestNonce = 0;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      const newPlatformCut = toBN(0);

      const tx = await this.contract.editContest(
        someone, 
        contestHash,
        contestArgs.selectedGames,
        contestArgs.entryFee,
        contestArgs.maxParticipants,
        contestArgs.contestIdType,
        newPlatformCut, // contestArgs.platformCut,
        contestArgs.creatorCut,
        contestArgs.isGuaranteed,
        {
          from: allowedOpManager 
        }
      );

      expectEvent(tx, 'EditContest', { 
        'contestHash': contestHash,
        'creator': someone,
        'entryFee': contestArgs.entryFee,
        'maxParticipants': contestArgs.maxParticipants,
        'contestIdType': contestArgs.contestIdType,
        'platformCut': newPlatformCut, //contestArgs.platformCut,
        'creatorCut': contestArgs.creatorCut,
        'isGuaranteed': contestArgs.isGuaranteed,
      });
    });

    it(`Increase participants counter OK`, async function() {
      const contestNonce = 0;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );

      await this.contract.increaseParticipantsCount(
        contestHash, { from: allowedOpManager }
      );

      // check values OK
      const obj = await this.contract.getContestByHash(contestHash);
      expect(obj.participantsCount).to.eq.BN(1);
    });

    it(`Fails edit - contest has entries`, async function() {
      const contestNonce = 0;
      const contestHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: contestNonce }, 
      );
      
      const newPlatformCut = toBN(0);

      await expectRevert(
        this.contract.editContest(
          someone, 
          contestHash,
          contestArgs.selectedGames,
          contestArgs.entryFee,
          contestArgs.maxParticipants,
          contestArgs.contestIdType,
          newPlatformCut, // contestArgs.platformCut,
          contestArgs.creatorCut,
          contestArgs.isGuaranteed,
          {
            from: allowedOpManager 
          }
        ),
        "EditContest() - the contest has entries"
      );
    });
  });
});