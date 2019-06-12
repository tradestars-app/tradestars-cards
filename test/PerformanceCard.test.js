import { TestHelper } from 'zos';
import { assertRevert, Contracts, ZWeb3 } from 'zos-lib';
import { toWei, BN } from 'web3-utils';

ZWeb3.initialize(web3.currentProvider);

require('chai').should();

const BondedERC20 = Contracts.getFromLocal('BondedERC20');
const BondedHelper = Contracts.getFromLocal('BondedERC20Helper');
const PerformanceCard = Contracts.getFromLocal('PerformanceCard');

/// Create a Mock Contract
const MockContract = Contracts.getFromLocal('MockContract');

/// check events
function checkAdminEvent(tx, eventName) {
  tx.events[eventName].event.should.be.eq(eventName)
}

// Helper functions

function createSignature(signer, msgHash) {
  return web3.eth.sign(signer, msgHash);
}

function createHash(args) {
  return Web3Utils.soliditySha3(
    { t: 'uint256', v: args['tokenId'] },
    { t: 'string', v: args['symbol'] },
    { t: 'string', v: args['name'] },
    { t: 'uint32', v: args['score'] },
    { t: 'uint256', v: args['cardValue'] }
  );
}

function createCardArgs(tokenId) {
  return {
    'tokenId': tokenId,
    'symbol': `T${tokenId}`,
    'name': `Test Card ${tokenId}`,
    'score': Math.floor(Math.random() * 9000 + 1000),
    'cardValue': toWei('1')
  };
}

async function createCard(tokenId, msgSigner, msgFrom) {
  let args = createCardArgs(tokenId);

  // console.log(args);
  const tx = await contract.createCard(
    args['tokenId'],
    args['symbol'],
    args['name'],
    args['score'],
    args['cardValue'],
    createHash(args),
    createSignature(
      msgSigner, createHash(args)
    ),
    {
      from: msgFrom,
      gasPrice: 26e9
    }
  );

  console.log("Gas ->", tx.receipt.gasUsed);
}

contract('PerformanceCard', ([_, owner, admin, someone, anotherone, buyer1, buyer2, buyer3, buyer4]) => {

  let contract;

  before(async function() {
    const project = await TestHelper();

    /// Create a TS Mock
    const tsToken = await MockContract.new({
      from: owner,
      gas: 4712388
    });

    /// Create a Reserve Mock
    const reserveToken = await MockContract.new({
      from: owner,
      gas: 4712388
    });

    /// Create a Kyber Mock
    const kyberProxy = await MockContract.new({
      from: owner,
      gas: 4712388
    });

    /// Configure default return types
    await tsToken.methods.givenAnyReturnBool(true).send();
    await reserveToken.methods.givenAnyReturnBool(true).send();
    await kyberProxy.methods.givenAnyReturnUint(0).send();

    /// Create a BondedHelper
    const bondedHelper = await BondedHelper.new({
      from: owner,
      gas: 4712388
    });

    // Create new PerformanceCard registry
    contract = await project.createProxy(PerformanceCard, {
      initMethod: 'initialize',
      initArgs: [
        owner,
        tsToken.address,
        reserveToken.address,
        kyberProxy.address,
        bondedHelper.address
      ]
    });
  });

  describe('Tests Admins Management', function() {

    it(`Should OK addAdmin()`, async function() {
      const tx = await contract.methods.addAdmin(admin).send({
        from: owner
      });

      checkAdminEvent(tx, 'AdminAdded');

      const isAdmin = await contract.methods.isAdmin(admin).call();
      isAdmin.should.be.eq(true);
    });

    it(`Should OK removeAdmin()`, async function() {
      const tx = await contract.methods.removeAdmin(admin).send({
        from: owner
      });

      checkAdminEvent(tx, 'AdminRemoved');

      const isAdmin = await contract.methods.isAdmin(admin).call();
      isAdmin.should.be.eq(false);
    });

    it(`Should FAIL addAdmin() :: not owner`, async function() {
      await assertRevert(
        contract.methods.addAdmin(admin).send({
          from: someone
        })
      );
    });

    it(`Should FAIL addAdmin() :: already admin`, async function() {
      await contract.methods.addAdmin(admin).send({ from: owner });
      await assertRevert(
        contract.methods.addAdmin(admin).send({ from: owner })
      );
    });

    it(`Should FAIL renounceAdmin() :: not admin`, async function() {
      await assertRevert(
        contract.methods.renounceAdmin().send({ from: someone })
      );
    });

    it(`Should OK renounceAdmin()`, async function() {
      const tx = await contract.methods.renounceAdmin().send({ from: admin });

      checkAdminEvent(tx, 'AdminRemoved');

      const isAdmin = await contract.methods.isAdmin(admin).call();
      isAdmin.should.be.eq(false);
    });

  });

  describe('Tests createCard()', function() {
    before(async function() {
      await contract.methods.addAdmin(admin).send({ from: owner });
    });

    it(`Should OK create`, async function() {
      const tokenId = 1000;
      await createCard(tokenId, admin, someone);
    });

    // it(`Should FAIL create :: (bad signer)`, async function() {
    //   const tokenId = 1001;
    //   await assertRevert(
    //     createCard(tokenId, aWallet)
    //   );
    // });

    // it(`Should FAIL create :: (card exists)`, async function() {
    //   const tokenId = 1000;
    //   await assertRevert(
    //     createCard(tokenId, owner)
    //   );
    // });
  });

  describe('Test Card Management', function() {

    // it(`should OK getCardInfo()`, async function() {
    //   const tokenId = 1000;
    //   const [ score, name ] = await contract.getCardInfo(tokenId);

    //   name.should.be.equal(`Test Card ${tokenId}`);
    //   score.should.be.bignumber.equal(10.00 * 1e4);
    // });

    // it(`should OK updateScore()`, async function() {
    //   const tokenId = 1000;
    //   const newScore = 10.52 * 1e4;

    //   await contract.updateScore(tokenId, newScore, { from: owner });

    //   const [ score, name ] = await contract.getPlayerInfo(tokenId);
    //   score.should.be.bignumber.equal(newScore);
    // });

    // it(`should OK updateScoresBulk()`, async function() {
    //   const tokenIds = [1000, 1001];
    //   const scores = [(10 * 1e4), (10 * 1e4)];

    //   await contract.updateScoresBulk(tokenIds, scores, {
    //     from: owner
    //   });
    // });

    // it(`should FAIL updateScore() :: not admin`, async function() {
    //   const tokenId = 1000;
    //   const newScore = 10.52 * 1e4;

    //   await assertRevert(
    //     contract.updateScore(tokenId, newScore, { from: someone })
    //   );
    // });

  });

  describe('Test BondedERC20 Balances', function() {
  //   const ERC20_INITIAL_SUPPLY = toWei('100000');

  //   it('Should OK check balances', async function() {
  //     const tokenId = 1000;

  //     const addr = await contract.fungiblesMap(tokenId);
  //     const bondedToken = BondedERC20.at(addr);

  //     const poolBalance = await bondedToken.poolBalance();
  //     const totalSupply = await bondedToken.totalSupply();

  //     const valueToReceive = await contract.estimateValue(tokenId, totalSupply);

  //     // Check balances
  //     totalSupply.should.be.bignumber.equal(ERC20_INITIAL_SUPPLY);
  //     poolBalance.should.be.bignumber.equal(1e14);

  //     // Check tokens reveived if total supply is sold
  //     valueToReceive.should.be.bignumber.equal(1e14);
  //   });
  });

  describe('Tests BondedERC20s (buy/sell)', function() {

  //   const tokenId = 1000;
  //   const txAmount = toWei('1');

  //   const nullAddress = '0x0000000000000000000000000000000000000000';

  //   // limits for used gas
  //   const BuyGasLimit = 135000;
  //   const SellGasLimit = 90000;
  //   const BuyGasLimitRecurrent = 82000;

  //   before(async function() {
  //     const mathPrecision = await contract.MATH_PRECISION();
  //     const gameTxFees = await contract.GAME_INVESTMENT_FEE();
  //     const ownerTxFees = await contract.OWNER_INVESTMENT_FEE();

  //     // Based on current contract params, calculate net txValue.
  //     this.txFees = gameTxFees.add(ownerTxFees).div(mathPrecision);
  //   });

  //   it('Should FAIL send direct funds the contract', async function() {
  //     await assertRevert(
  //       ethSendTransaction({ to: contract.address, from: someone, value: txAmount })
  //     );
  //   })

  //   it(`Should OK estimateTokens()`, async function() {
  //     await contract.estimateTokens(tokenId, txAmount).call();
  //   })

  //   it(`Should OK buyShares()`, async function() {
  //     const gasPrice = 26e9;

  //     // Values we'll check after buy op.
  //     const tokensToMint = await contract.estimateTokens(tokenId, txAmount);
  //     const txNetAmount = txAmount * (1 - this.txFees);

  //     // Buy action
  //     const { receipt, logs } = await contract.buyShares(tokenId, {
  //         from: anotherone,
  //         value: txAmount,
  //         gasPrice: gasPrice
  //     });

  //     console.log('gas->', receipt.gasUsed);

  //     // assert gas is bellow limit
  //     assert.isBelow(receipt.gasUsed, BuyGasLimit);

  //     // ERROR IN TRUFFLE TEST:
  //     // There should be 2 events, but there's a 3rd.
  //     // Transfer() event in TX is not from the bondedToken contract
  //     // its the Transfer from ERC20 that should not be here, but since
  //     // ERC721 has a similar event, is showing up here.
  //     assert.equal(logs.length, 3);

  //     checkMintBondedERC20(logs[1], tokenId, anotherone, txNetAmount, tokensToMint);
  //     checkTransferBondedERC20(logs[2], tokenId, nullAddress, anotherone, tokensToMint);
  //   });

  //   it(`Should OK test recurrent BuyShares (GasLimit).`, async function() {
  //     const gasPrice = 26e9;
  //     let tx;

  //     for (let x = 0; x < 5; x++) {
  //       // Buy action
  //       tx = await contract.buyShares(tokenId, {
  //           from: anotherone,
  //           value: txAmount,
  //           gasPrice: gasPrice
  //       });

  //       console.log('gas->', tx.receipt.gasUsed);

  //       // assert gas is bellow limit
  //       assert.isBelow(tx.receipt.gasUsed, BuyGasLimitRecurrent);
  //     }
  //   });

  //   it(`should FAIL buyShares (payable value == 0)`, async function() {
  //     const gasPrice = 26e9;

  //     await assertRevert(
  //       contract.buyShares(tokenId, {
  //         from: anotherone,
  //         value: 0,
  //         gasPrice: gasPrice
  //       })
  //     );
  //   });

  //   it(`should FAIL buyShares (gasPrice > gasPriceLimit)`, async function() {
  //     const gasPrice = 27e9;

  //     await assertRevert(
  //       contract.buyShares(tokenId, {
  //         from: anotherone,
  //         value: txAmount,
  //         gasPrice: gasPrice
  //       })
  //     );
  //   });

  //   it(`should FAIL buyShares (non existing Token)`, async function() {
  //     const nonExistingTokenId = 50000;
  //     const gasPrice = 26e9;

  //     await assertRevert(
  //       contract.buyShares(nonExistingTokenId, {
  //         from: anotherone,
  //         value: txAmount,
  //         gasPrice: gasPrice
  //       })
  //     );
  //   });

  //   it(`Should OK sellShares()`, async function() {
  //     const gasPrice = 26e9;

  //     // Get account tokens.
  //     const addr = await contract.fungiblesMap(tokenId);
  //     const bondedContract = BondedERC20.at(addr);

  //     const tokensAmount = await bondedContract.balanceOf(anotherone);
  //     const valueToReceive = await contract.estimateValue(tokenId, tokensAmount);

  //     // Buy action
  //     const { receipt, logs } = await contract.sellShares(tokenId, tokensAmount, {
  //       from: anotherone,
  //       gasPrice: gasPrice
  //     });

  //     console.log('gas->', receipt.gasUsed);

  //     // assert gas is bellow limit
  //     assert.isBelow(receipt.gasUsed, SellGasLimit);

  //     // ERROR IN TRUFFLE TEST:
  //     // There should be 2 events, but there's a 3rd.
  //     // Transfer() event in TX is not from the bondedToken contract
  //     // its the Transfer from ERC20 that should not be here, but since
  //     // ERC721 has a similar event, is showing up here.
  //     assert.equal(logs.length, 3);

  //     checkBurnBondedERC20(logs[1], tokenId, anotherone, valueToReceive, tokensAmount);
  //     checkTransferBondedERC20(logs[2], tokenId, anotherone, nullAddress, tokensAmount);

  //     for (let l of logs) {
  //       if (l.event == 'BurnBondedERC20') {
  //         console.log("VALUE :: ", l.args.tokenId, " -> ", l.args.value.toString());
  //       }
  //       if (l.event == 'TransferBondedERC20') {
  //         console.log("AMOUNT :: ", l.args.tokenId, " -> ", l.args.amount.toString());
  //       }
  //     }
  //   });

  //   it(`should FAIL sellShares (non token holder)`, async function() {
  //     const gasPrice = 26e9;

  //     // Get account tokens.
  //     const addr = await contract.fungiblesMap(tokenId);
  //     const bondedContract = BondedERC20.at(addr);

  //     const tokensAmount = await bondedContract.balanceOf(someone);

  //     await assertRevert(
  //       contract.sellShares(tokenId, tokensAmount, {
  //         from: aWallet,
  //         gasPrice: gasPrice
  //       })
  //     );
  //   });

  //   it(`should FAIL sellShares (non existing Token)`, async function() {
  //     const nonExistingTokenId = 50000;
  //     const gasPrice = 26e9;

  //     // Get account tokens.
  //     const addr = await contract.fungiblesMap(tokenId);
  //     const bondedContract = BondedERC20.at(addr);

  //     const tokensAmount = await bondedContract.balanceOf(someone);

  //     await assertRevert(
  //       contract.sellShares(nonExistingTokenId, tokensAmount, {
  //         from: anotherone,
  //         gasPrice: gasPrice
  //       })
  //     );
  //   });

  //   it('Should OK check balances', async function() {
  //     const addr = await contract.fungiblesMap(tokenId);
  //     const bondedContract = BondedERC20.at(addr);

  //     const poolBalance = await bondedContract.poolBalance();
  //     const totalSupply = await bondedContract.totalSupply();

  //     console.log("poolBalance, ", web3.fromWei(poolBalance).toString());
  //     console.log("totalSupply, ", web3.fromWei(totalSupply).toString());

  //     const valueToReceive = await contract.estimateValue(tokenId, totalSupply);

  //     // Check balances
  //     totalSupply.should.be.bignumber.equal(100000e18);
  //     console.log("valueToReceive, ", web3.fromWei(valueToReceive).toString());
  //   });

  //   it(`should FAIL sellShares (gasPrice > gasPriceLimit)`, async function() {
  //     const gasPrice = 27e9;

  //     // Get account tokens.
  //     const addr = await contract.fungiblesMap(tokenId);
  //     const bondedContract = BondedERC20.at(addr);

  //     const tokensAmount = await bondedContract.balanceOf(someone);

  //     await assertRevert(
  //       contract.sellShares(tokenId, tokensAmount, {
  //         from: anotherone,
  //         gasPrice: gasPrice
  //       })
  //     );
  //   });

  //   it(`Should OK check issued tokens while changing score`, async function() {
  //     const gasPrice = 26e9;
  //     const tokenId = 1004;
  //     const txAmount = web3.toWei(10, 'ether');

  //     // Get account tokens.
  //     const addr = await contract.fungiblesMap(tokenId);
  //     const bondedContract = BondedERC20.at(addr);

  //     let initialContractBalance = await bondedContract.poolBalance();
  //     let initialOwnerBalance = await bondedContract.balanceOf(owner);
  //     let initialUnlockerBalance = await bondedContract.balanceOf(unlocker);
  //     let initialOwnerEthBalance = await web3.eth.getBalance(owner);

  //     console.log(`Registry Balance :: ${web3.fromWei(initialContractBalance - 0)}`);

  //     console.log(`Owner Tokens :: ${web3.fromWei(initialOwnerBalance - 0)}`);
  //     console.log(`Unlocker Tokens :: ${web3.fromWei(initialUnlockerBalance - 0)}`);

  //     const [ score, name ] = await contract.getPlayerInfo(tokenId);
  //     console.log(`Player Score :: ${score} - [${name}]`);

  //     // Check initial token bakance == 0
  //     let wallet = buyer3;
  //     let tokensAmount = await bondedContract.balanceOf(wallet);

  //     // Check 0 balance
  //     tokensAmount.should.bignumber.be.equal(0);

  //     for (let x = 0; x < 10; x++) {

  //       let totalSupply = await bondedContract.totalSupply();

  //       // Buy txAmount from wallet
  //       await contract.buyShares(tokenId, {
  //         from: wallet,
  //         value: txAmount,
  //         gasPrice: gasPrice
  //       });

  //       let totalSupplyBefore = await bondedContract.totalSupply();

  //       let contractBalance = await bondedContract.poolBalance();
  //       let ownerTokens = await bondedContract.balanceOf(owner);
  //       let ownerEthBalance = await web3.eth.getBalance(owner);

  //       let unlockerTokens = await bondedContract.balanceOf(unlocker);

  //       console.log(`===========`);
  //       console.log(` TOTAL :: ${web3.fromWei(txAmount * (1 + x))} ETH` );
  //       console.log(` Investment [${wallet}] :: ${web3.fromWei(txAmount - 0)} ETH`);
  //       console.log(` Minted Tokens :: ${web3.fromWei(totalSupplyBefore - totalSupply)}`);
  //       console.log(` TOTAL Tokens :: ${web3.fromWei(totalSupplyBefore - 0)}`);
  //       console.log(` TOTAL Registry Balance :: ${web3.fromWei(contractBalance - 0)} ETH`);
  //       console.log(` Owner Tokens :: ${web3.fromWei(ownerTokens - 0)}`);
  //       console.log(` Owner ETH :: ${web3.fromWei(ownerEthBalance - initialOwnerEthBalance)}`);

  //       const valueToReceive = await contract.estimateValue(tokenId, ownerTokens, {
  //         from: wallet
  //       });

  //       const valueToReceiveUnlocker = await contract.estimateValue(tokenId, unlockerTokens, {
  //         from: wallet
  //       });

  //       console.log(` Owner Worth ${web3.fromWei(valueToReceive - 0)} ETH - ${valueToReceive/contractBalance*100}%`);
  //       console.log(` Unlocker Worth ${web3.fromWei(valueToReceiveUnlocker - 0)} ETH - ${valueToReceiveUnlocker/contractBalance*100}%`);
  //     }
  //     console.log("..");
  //   });

  });

  // it(`Collections tests`, function() {
  //   collectionsTest(contract, owner, aWallet, someone, anotherone, buyer1, buyer2, buyer3);
  // });

});