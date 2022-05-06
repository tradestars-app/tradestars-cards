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
const EntryStorage = artifacts.require('EntryStorage');

describe('EntryStorage', function () {

  let owner, someone, anotherone, allowedOpManager;

  const entryArgs = {
    'contestHash': web3.eth.abi.encodeParameter('bytes32', "0x100001"),
    'draftedPlayers': web3.eth.abi.encodeParameter('string', "0001|0002")
  };

  before(async function() {

    [ owner, someone, anotherone, allowedOpManager ] = await web3.eth.getAccounts();

    /// Create and initialize a ContestStorage
    this.contract = await EntryStorage.new({ from: owner });
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

  describe('Test Entries ABM', function() {

    it(`Fails create from non op manager`, async function() {
      await expectRevert(
        this.contract.createEntry(
          someone, 
          entryArgs.contestHash,
          entryArgs.draftedPlayers,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });

    it(`Creates entry OK`, async function() {
      const tx = await this.contract.createEntry(
        someone, 
        entryArgs.contestHash,
        entryArgs.draftedPlayers,
        {
          from: allowedOpManager 
        }
      );
      expectEvent(tx, 'CreateEntry', { 
        'from': someone,
        'contestHash': entryArgs.contestHash,
        'draftedPlayers': entryArgs.draftedPlayers
      });
    });

    it(`Edits created entry OK`, async function() {
      
      const entryHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: entryArgs.contestHash }, 
        { t: 'uint256', v: 0 }, // created entry nonce
      );

      const newDraftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0003");
      
      const tx = await this.contract.editEntry(
        someone, 
        entryHash,
        newDraftedPlayers,
        {
          from: allowedOpManager 
        }
      );

      expectEvent(tx, 'EditEntry', { 
        'draftedPlayers': newDraftedPlayers
      });
    });

    it(`Fails edit from non op manager`, async function() {
      
      const entryHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: entryArgs.contestHash }, 
        { t: 'uint256', v: 0 }, // created entry nonce
      );
      
      const newDraftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0003");

      await expectRevert(
        this.contract.editEntry(
          someone, 
          entryHash,
          newDraftedPlayers,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });

    it(`Fails edit by invalid owner`, async function() {
      const entryHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: entryArgs.contestHash }, 
        { t: 'uint256', v: 0 }, // created entry nonce
      );
      
      const newDraftedPlayers = web3.eth.abi.encodeParameter('string', "0001|0003");

      await expectRevert(
        this.contract.editEntry(
          anotherone, 
          entryHash,
          newDraftedPlayers,
          {
            from: allowedOpManager 
          }
        ),
        "editEntry() - invalid owner"
      );
    });
  });

  describe('Test Claim entries', function() {
    it(`Fails claim by non op manager`, async function() {
      const entryHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: entryArgs.contestHash }, 
        { t: 'uint256', v: 0 }, // created entry nonce
      );
    
      await expectRevert(
        this.contract.claimEntry(
          someone, 
          entryHash,
          {
            from: anotherone 
          }
        ),
        "caller is not allowed"
      );
    });
    
    it(`Fails claim by invalid owner`, async function() {
 
      const entryHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: entryArgs.contestHash }, 
        { t: 'uint256', v: 0 }, // created entry nonce
      );
    
      await expectRevert(
        this.contract.claimEntry(
          anotherone, 
          entryHash,
          {
            from: allowedOpManager 
          }
        ),
        "claimEntry() - invalid owner"
      );
    });

    it(`Claims entry OK`, async function() {
      const entryHash = soliditySha3(
        { t: 'address', v: someone },
        { t: 'uint256', v: entryArgs.contestHash }, 
        { t: 'uint256', v: 0 }, // created entry nonce
      );
      const tx = await this.contract.claimEntry(
        someone, 
        entryHash,
        {
          from: allowedOpManager 
        }
      );

      expectEvent(tx, 'ClaimEntry', { 
        'from': someone,
        'entryHash': entryHash
      });

    });
  });
});