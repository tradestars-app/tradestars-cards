const {
  BN,
  expectEvent, // Assertions for emitted events
  expectRevert // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const { toWei } = require('web3-utils');

const BondedERC20 = artifacts.require('BondedERC20');
const BondedHelper = artifacts.require('BondedERC20Helper');
const FractionableERC721 = artifacts.require('FractionableERC721');

const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

describe('FractionableERC721', function () {

  let owner, someone, tokenManager;

  before(async function() {

    [ owner, someone, tokenManager ] = await web3.eth.getAccounts();

    /// Create and initialize a fractionableERC721
    const bondedHelper = await BondedHelper.new({ from: owner });

    this.contract = await FractionableERC721.new(
      bondedHelper.address,
      "name",
      "symbol", {
        from: owner
      }
    );
  });

  describe('Setting TokenManager', function() {

    it(`Is set OK`, async function() {
      await this.contract.setOperationManager(tokenManager, {
        from: owner
      })
    });

    it(`Fail to set :: not owner`, async function() {
      await expectRevert(
        this.contract.setOperationManager(tokenManager, {
          from: someone
        }),
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('Creating the NFT', function() {

    let newToken;

    before(function () {
      newToken = {
        tokenId: 1000,
        beneficiary: someone,
        symbol: "symbol",
        name: "name"
      }
    })

    it(`Mints OK called from tokenManager`, async function() {
      const tx = await this.contract.mintToken(
        newToken['tokenId'],
        newToken['beneficiary'],
        newToken['symbol'],
        newToken['name'],
        {
          from: tokenManager,
        }
      );
      expectEvent(tx, 'Transfer');
    });

    it(`Fails if called from non tokenManager`, async function() {
      await expectRevert(
        this.contract.mintToken(
          newToken['tokenId'],
          newToken['beneficiary'],
          newToken['symbol'],
          newToken['name'],
          {
            from: owner
          }
        ),
        'caller is not allowed'
      );
    });
  });

  describe('Changing token reserve ratio', function() {

    it(`Changes OK default bonded tokens ratio`, async function() {
      const reserveRatio = '55555';

      await this.contract.setBondedTokensDefaultRR(reserveRatio,
        {
          from: owner
        }
      )
    });

    it(`Changes OK called from owner`, async function() {
      const tokenId = 1000;
      const reserveRatio = '222222';

      await this.contract.setBondedTokenRR(
        tokenId,
        reserveRatio,
        {
          from: owner
        }
      )
    });

    it(`Fails if called by non owner :: not owner`, async function() {
      const tokenId = 1000;
      const reserveRatio = '222222';

      await expectRevert(
        this.contract.setBondedTokenRR(
          tokenId,
          reserveRatio,
          {
            from: tokenManager
          }
        ),
        'Ownable: caller is not the owner'
      );
    });

  });

  describe('Minting bonded tokens', function() {
    const tokenId = 1000;

    it(`Mints OK called from tokenManager`, async function() {

      const mintAmount = toWei('100');
      const mintValue = toWei('100');

      const txHash = await this.contract.mintBondedERC20(
        tokenId,
        someone,
        mintAmount,
        mintValue,
        {
          from: tokenManager
        }
      )

      const addr = await this.contract.getBondedERC20(tokenId)
      const bondedToken = await BondedERC20.at(addr);

      const tSupply = await bondedToken.poolBalance()
      const pBalance = await bondedToken.poolBalance()

      expect(
        tSupply,
        'total supply should be 100 eth'
      ).to.be.eq.BN(mintAmount);

      expect(
        pBalance,
        'pool balance should be 100 eth'
      ).to.be.eq.BN(mintValue);
    });

    it(`Burns OK called from tokenManager`, async function() {

      const burnAmount = toWei('100');
      const burnValue = toWei('100');

      const txHash = await this.contract.burnBondedERC20(
        tokenId,
        someone,
        burnAmount,
        burnValue,
        {
          from: tokenManager
        }
      )

      const addr = await this.contract.getBondedERC20(tokenId)
      const bondedToken = await BondedERC20.at(addr);

      const tSupply = await bondedToken.poolBalance()
      const pBalance = await bondedToken.poolBalance()

      expect(
        tSupply,
        'total supply should be 0'
      ).to.be.eq.BN(0);

      expect(
        pBalance,
        'pool balance should be 0'
      ).to.be.eq.BN(0);
    });

  });


  describe('Trading estimations', function() {
    const tokenId = '1000';

    before(async function() {

      /// Mint Initial amount on tokens / reserve

      const mintAmount = toWei('100');
      const mintValue = toWei('100');

      const txHash = await this.contract.mintBondedERC20(
        tokenId,
        someone,
        mintAmount,
        mintValue,
        {
          from: tokenManager
        }
      );

      /// set reserve ratio 1/1 for next tests

      const reserveRatio = '1000000';

      await this.contract.setBondedTokenRR(
        tokenId,
        reserveRatio,
        {
          from: owner
        }
      );
    });

    it(`OK calling estimateBondedERC20Tokens()`, async function() {
      const value = toWei('100');

      const ret = await this.contract.estimateBondedERC20Tokens(
        tokenId,
        value
      );

      expect(
        ret,
        'token amount invalid'
      ).to.be.eq.BN(value);
    });

    it(`OK calling estimateBondedERC20Value()`, async function() {
      const amount = toWei('100');

      const ret = await this.contract.estimateBondedERC20Value(
        tokenId,
        amount
      );

      expect(
        ret,
        'reserve value invalid'
      ).to.be.eq.BN(amount);
    });
  });
});

