import { TestHelper } from 'zos';
import { assertRevert, Contracts, ZWeb3 } from 'zos-lib';
import { toWei, soliditySha3, toBN } from 'web3-utils';

console.log("web3.version: ", web3.version);

ZWeb3.initialize(web3.currentProvider);

require('chai').should();

const BondedERC20 = Contracts.getFromLocal('BondedERC20');
const BondedHelper = Contracts.getFromLocal('BondedERC20Helper');
const PerformanceCard = Contracts.getFromLocal('PerformanceCard');

/// Create a Mock Contract
const ERC20Mock = Contracts.getFromLocal('ERC20Mock');
const KyberMock = Contracts.getFromLocal('KyberMock');

/// check events
function checkAdminEvent(tx, eventName) {
  tx.events[eventName].event.should.be.eq(eventName)
}

// Helper functions

const assertGasLt = async (txHash, expected) => {
  const { gas } = await ZWeb3.getTransaction(txHash);
  gas.should.be.at.most(parseInt(expected));
};

const assertGas = async (txHash, expected) => {
  const { gas } = await ZWeb3.getTransaction(txHash);
  gas.should.be.eq(parseInt(expected));
};

const assertGasPrice = async (txHash, expected) => {
  const { gasPrice } = await ZWeb3.getTransaction(txHash);
  parseInt(gasPrice, 10).should.be.eq(expected);
};

const assertFrom = async (txHash, expected) => {
  const { from } = await ZWeb3.getTransaction(txHash);
  from.should.be.eq(expected);
};

const createSignature = async  (msgHash, signer) => {
  const signature = await web3.eth.sign(msgHash, signer);

  // in geth its always 27/28, in ganache its 0/1. Change to 27/28 to prevent
  // signature malleability if version is 0/1
  // see https://github.com/ethereum/go-ethereum/blob/v1.8.23/internal/ethapi/api.go#L465
  let v = parseInt(signature.slice(130, 132), 16);

  if (v < 27) {
    v += 27;
  }

  const vHex = v.toString(16);

  return signature.slice(0, 130) + vHex;
}

const createHash = (args) => {
  return soliditySha3(
    { t: 'uint256', v: args['tokenId'] },
    { t: 'string', v: args['symbol'] },
    { t: 'string', v: args['name'] },
    { t: 'uint32', v: args['score'] },
    { t: 'uint256', v: args['cardValue'] }
  );
}

const createCardArgs = (tokenId) => {
  return {
    'tokenId': tokenId,
    'symbol': `T${tokenId}`,
    'name': `Test Card ${tokenId}`,
    'score': 5500,
    'cardValue': toWei('1')
  };
}

contract('PerformanceCard', ([_, owner, admin, someone, anotherone, buyer1, buyer2, buyer3, buyer4]) => {

  let contract;
  let tsToken;
  let reserveToken;
  let kyberProxy;

  before(async function() {
    const project = await TestHelper();

    /// Create Mock ERC20 Contracts
    tsToken = await ERC20Mock.new({ gas: 4000000 });
    reserveToken = await ERC20Mock.new({ gas: 4000000 });

    /// Create Mock kyberProxy
    kyberProxy = await KyberMock.new({ gas: 4000000 });

    /// Create BondedHelper
    const bondedHelper = await BondedHelper.new({ gas: 4000000 });

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

  describe('Tests gasPriceLimit Management', function() {

    before(async function() {
      await contract.methods.addAdmin(admin).send({ from: owner });
    });

    it(`Should OK setGasPriceLimit()`, async function() {
      let gasLimit = await contract.methods.gasPriceLimit().call();
      gasLimit.should.be.eq('0');

      const newLimit = toWei('26', 'gwei');

      const tx = await contract.methods.setGasPriceLimit(newLimit).send({
        from: admin
      });

      checkAdminEvent(tx, 'GasPriceLimitChanged');

      gasLimit = await contract.methods.gasPriceLimit().call();
      gasLimit.should.be.eq(newLimit);
    });

    it(`Should FAIL setGasPriceLimit() :: not admin`, async function() {
      const newLimit = toWei('26', 'gwei');

      await assertRevert(
        contract.methods.setGasPriceLimit(newLimit).send({
          from: someone
        })
      );
    });

  });

  describe('Tests Card Create', function() {

    async function createCard(cardArgs, msgSigner, msgSender) {

      const msgHash = createHash(cardArgs);
      const signature = await createSignature(msgHash, msgSigner);

      return contract.methods.createCard(
        cardArgs['tokenId'],
        cardArgs['symbol'],
        cardArgs['name'],
        cardArgs['score'],
        cardArgs['cardValue'],
        msgHash,
        signature
      ).send({
        from: msgSender,
        gas: 6721975,
        gasPrice: toWei('10', 'gwei')
      });
    }

    before(async function() {
      const mintAmount = toWei('1000');

      await tsToken.methods.mint(someone, mintAmount).send();
      await reserveToken.methods.mint(kyberProxy.address, mintAmount).send();

      /// Aprove Card contract to spend up to mintAmount TS
      await tsToken.methods.approve(contract.address, mintAmount).send({
        from: someone
      });
    });

    it(`Should OK createCard()`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      /// BUG: can't use await. Promise returns unresolved and hangs test.
      // const rcpt = await createCard(cardArgs, admin, someone);
      // console.log(rcpt);

      createCard(cardArgs, admin, someone).then(async (rctp) => {
        console.log(rcpt);

        const uri = await contract.methods.tokenURI(tokenId).call();
        uri.should.be.eq(`https://api.tradestars.app/cards/${tokenId}`);
      });
    });

    it(`Should FAIL createCard() :: card exists`, async function() {
      const tokenId = 1000;
      const cardArgs = createCardArgs(tokenId);

      await assertRevert(
        createCard(cardArgs, admin, someone)
      );
    });

    it(`Should FAIL createCard() :: bad signer`, async function() {
      const tokenId = 1001;
      const cardArgs = createCardArgs(tokenId);

      await assertRevert(
        createCard(cardArgs, anotherone, someone)
      );
    });
  });

  describe('Test Card Score Management', function() {

    const tokenId = 1000;
    let score = 0;

    it(`should OK getScore()`, async function() {
      score = await contract.methods.getScore(tokenId).call();
      score.should.be.eq('5500'); /// created token initial score
    });

    it(`should OK updateScore()`, async function() {
      const newScore = 3500;

      await contract.methods.updateScore(tokenId, newScore).send({
        from: admin
      });

      score = await contract.methods.getScore(tokenId).call();
      score.should.be.eq('3500');
    });

    it(`should OK updateScoresBulk()`, async function() {
      const tokenIds = [tokenId, tokenId];
      const newScores = [2000, 3000];

      await contract.methods.updateScoresBulk(tokenIds, newScores).send({
        from: admin
      });

      score = await contract.methods.getScore(tokenId).call();
      score.should.be.eq('3000');
    });

    it(`should FAIL updateScore() :: not admin`, async function() {
      const newScore = 7000;

      await assertRevert(
        contract.methods.updateScore(tokenId, newScore).send({
          from: someone
        })
      );
    });

  });

  describe('Test BondedERC20 initial balances', function() {

    const tokenId = 1000;
    const cardValue = toWei('1');

    let bondedToken = null;

    let MATH_PRECISION = 0;
    let ERC20_INITIAL_SUPPLY = 0;
    let ERC20_INITIAL_POOL_SHARE = 0;

    before(async function() {
      MATH_PRECISION = await contract.methods.MATH_PRECISION().call();
      ERC20_INITIAL_SUPPLY = await contract.methods.ERC20_INITIAL_SUPPLY().call();
      ERC20_INITIAL_POOL_SHARE = await contract.methods.ERC20_INITIAL_POOL_SHARE().call();
    });

    it('Should OK getBondedERC20()', async function() {
      const addr = await contract.methods.getBondedERC20(tokenId).call();
      bondedToken = BondedERC20.at(addr);
    });

    it('Should OK totalSupply()', async function() {
      const totalSupply = await bondedToken.methods.totalSupply().call();
      totalSupply.should.be.equal(ERC20_INITIAL_SUPPLY);
    });

    it('Should OK poolBalance()', async function() {
      const expected = toBN(cardValue)
        .mul( toBN(ERC20_INITIAL_POOL_SHARE) )
        .div( toBN(MATH_PRECISION) );

      const poolBalance = await bondedToken.methods.poolBalance().call();
      poolBalance.should.be.equal(expected.toString());
    });

  });

  describe('Test BondedERC20s buy / sell', function() {

    const tokenId = 1000;
    const txAmount = toWei('1');

    let bondedToken = null;

    let MATH_PRECISION = 0;
    let GAME_INVESTMENT_FEE = 0;
    let OWNER_INVESTMENT_FEE = 0;

    before(async function() {

      /// Mint TS for buyers.
      await Promise.all([
        tsToken.methods.mint(buyer1, txAmount).send(),
        tsToken.methods.mint(buyer2, txAmount).send(),
        tsToken.methods.mint(buyer3, txAmount).send(),
      ]);

      /// Get buy Tx Fees
      [ MATH_PRECISION, GAME_INVESTMENT_FEE, OWNER_INVESTMENT_FEE ] = await Promise.all([
        contract.methods.MATH_PRECISION().call(),
        contract.methods.GAME_INVESTMENT_FEE().call(),
        contract.methods.OWNER_INVESTMENT_FEE().call()
      ]);

      // Get BondedERC20
      const addr = await contract.methods.getBondedERC20(tokenId).call();
      bondedToken = BondedERC20.at(addr);
    });

    it('Should FAIL :: send eth to contract', async function() {
      await assertRevert(
        ZWeb3.sendTransaction({
          to: contract.address,
          from: someone,
          value: txAmount
        })
      );
    })

    it(`Should OK buyShares()`, async function() {

      /// Allow Buyer1 TS balance use from Card contract
      await tsToken.methods.approve(contract.address, txAmount).send({
        from: buyer1
      });

      const prevBalance = await bondedToken.methods.balanceOf(buyer1).call();
      const tsPrevBalance = await tsToken.methods.balanceOf(buyer1).call();

      const tokensToMint = await contract.methods.estimateTokens(tokenId, txAmount).call();

      console.log('prevBalance:', prevBalance);
      console.log('tsPrevBalance:', tsPrevBalance);

      console.log('tokensToMint:', tokensToMint);

      const tx = await contract.methods.buyShares(tokenId, txAmount).send({
        from: buyer1,
        gas: 4000000
      });

      console.log('tx ->', tx);

      const postBalance = await bondedToken.methods.balanceOf(buyer1).call();
      const tsPostBalance = await tsToken.methods.balanceOf(buyer1).call();

      console.log('tsPostBalance:', tsPostBalance);
      console.log('postBalance:', postBalance);

    });

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

});