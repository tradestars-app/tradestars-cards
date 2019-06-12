const { assertRevert } = require('zos-lib');
const encodeCall = require('zos-lib/lib/helpers/encodeCall').default;

const BondedERC20 = artifacts.require('BondedERC20');
const TSCollection = artifacts.require('PerformanceCollection');

const Web3Utils = require('web3-utils');

function createSignature(signer, msgHash) {
  return web3.eth.sign(signer, msgHash);
}

function createHash(args) {
  return Web3Utils.soliditySha3(
    { t: 'uint256', v: args['collectionId'] },
    { t: 'string', v: args['name'] },
    { t: 'string', v: args['symbol'] },
    { t: 'string', v: args['uri'] },
    { t: 'uint256[]', v: args['tokenIds'] },
    { t: 'uint256[]', v: args['shares'] }
  );
}


function playersCollectionArgs(collectionId) {
  return {
    'collectionId': collectionId,
    'playersCollection': true,
    'symbol': `#${collectionId}`,
    'name': `Test Players Collection ${collectionId}`,
    'uri': `/collection/${collectionId}`,
    'tokenIds': [1006, 1007, 1008, 1009],
    'shares': [250, 250, 250, 250]
  };
}

function collectionsCollectionArgs(collectionId) {
  return {
    'collectionId': collectionId,
    'playersCollection': false,
    'symbol': `#${collectionId}`,
    'name': `Test Collections Collection ${collectionId}`,
    'uri': `/collection/${collectionId}`,
    'tokenIds': [1000, 1001, 1002, 1003],
    'shares': [250, 250, 250, 250]
  };
}

module.exports = function(playersRegistry, owner, aWallet, someone, anotherone, buyer1, buyer2, buyer3) {

  let contract;
  let txParams = {};

  async function newCollection() {
    const registry = await TSCollection.new({ from: owner });
    const callData = encodeCall('initialize',
      ['address', 'address'], [owner, playersRegistry.address]
    );

    // initialize collection
    await registry.sendTransaction({ data: callData, from: owner });

    return registry;
  }

  describe('Collections', function () {

    before(async function() {
      contract = await newCollection();
    });

    describe('when there are no collections', function () {

      it('sould OK to create (4) player collections', async function () {

        for (let collectionId = 1000; collectionId < 1004; collectionId++) {
          const args = playersCollectionArgs(collectionId);
          const { receipt } = await contract.createCollection(
            args['collectionId'],
            args['playersCollection'],
            args['name'],
            args['symbol'],
            args['uri'],
            args['tokenIds'],
            args['shares'],
            createHash(args),
            createSignature(
              owner, createHash(args)
            ),
            {
              from: owner,
              gasPrice: 26e9
            }
          );
          console.log("gas ->", receipt.gasUsed);
        }
      });

      it('should OK to create collection\'s collection', async function () {
        const collectionId = 2000;

        const args = collectionsCollectionArgs(collectionId);
        const { receipt } = await contract.createCollection(
          args['collectionId'],
          args['playersCollection'],
          args['name'],
          args['symbol'],
          args['uri'],
          args['tokenIds'],
          args['shares'],
          createHash(args),
          createSignature(
            owner, createHash(args)
          ),
          {
            from: owner,
            gasPrice: 26e9
          }
        );
        console.log("gas ->", receipt.gasUsed);
      });
    });

    describe('when there are collections', function () {

      // limits for used gas
      const pcBuyGasLimit = 980000; // players collection
      const ccBuyGasLimit = 3900000; // collections collection

      it('Invest on a players\' collection', async function () {
        const collectionId = 1000;
        const txAmount = web3.toWei(4, 'ether');

        const { receipt, logs } = await contract.buyShares(collectionId, {
          from: anotherone,
          value: txAmount,
          gasPrice: 26e9
        });

        console.log('gas ->', receipt.gasUsed);

        // assert gas is bellow limit
        assert.isBelow(receipt.gasUsed, pcBuyGasLimit);

        const addr = await contract.fungiblesMap(collectionId);
        const bondedContract = BondedERC20.at(addr);

        const totalSupply = await bondedContract.totalSupply();
        const poolBalance = await bondedContract.poolBalance();

        const tokensAmount = await bondedContract.balanceOf(anotherone);

        console.log("totalSupply ->", web3.fromWei(totalSupply).toString());
        console.log("poolBalance ->", web3.fromWei(poolBalance).toString());
        console.log("tokensAmount ->", web3.fromWei(tokensAmount).toString());

        for (let l of logs) {
          if (l.event == 'MintBondedERC20') {
            console.log("VALUE :: ", l.args.tokenId, " -> ", l.args.value.toString());
          }
          if (l.event == 'TransferBondedERC20') {
            console.log("AMOUNT ::", l.args.tokenId, " -> ", l.args.amount.toString());
          }
          if (l.event == 'Log') {
            console.log(l.args.log, " -> ", l.args.val.toString());
          }
        }
      });

      it('Divest on a players\' collection', async function () {
        const collectionId = 1000;

        const addr = await contract.fungiblesMap(collectionId);
        const bondedContract = BondedERC20.at(addr);

        const totalSupply = await bondedContract.totalSupply();
        const poolBalance = await bondedContract.poolBalance();

        const tokensAmount = await bondedContract.balanceOf(anotherone);

        console.log("tokensAmount->", web3.fromWei(tokensAmount).toString());

        // Is important to call this method from msg owner of the collection we;re quering.
        const valueToReceive = await contract.estimateValue(
          collectionId,
          tokensAmount, {
            from: anotherone
          }
        );

        console.log("valueToReceive->", web3.fromWei(valueToReceive).toString());
        console.log("totalSupply ->", web3.fromWei(totalSupply).toString());
        console.log("poolBalance ->", web3.fromWei(poolBalance).toString());
        console.log("--------------");

        const { receipt, logs } = await contract.sellShares(collectionId, tokensAmount, {
          from: anotherone,
          gasPrice: 26e9
        });

        for (let l of logs) {
          if (l.event == 'BurnBondedERC20') {
            console.log("VALUE :: ", l.args.tokenId, " -> ", web3.fromWei(l.args.value).toString());
          }
          if (l.event == 'TransferBondedERC20') {
            console.log("AMOUNT ::", l.args.tokenId, " -> ", web3.fromWei(l.args.amount).toString());
          }
          if (l.event == 'Log') {
            console.log(l.args.log, "::", l.args.val.toString());
          }
        }

        // console.log(valueToReceive);
        console.log("gas ->", receipt.gasUsed);
      });

      it('Invest on a collections\' collection', async function () {
        const collectionId = 2000;
        const txAmount = web3.toWei(1, 'ether');

        const { receipt } = await contract.buyShares(collectionId, {
          from: anotherone,
          value: txAmount,
          gasPrice: 26e9
        });

        // assert gas is bellow limit
        assert.isBelow(receipt.gasUsed, ccBuyGasLimit);

        console.log("gas ->", receipt.gasUsed);
      });

      it('Divest on a collections\' collection', async function () {
        const collectionId = 2000;

        const addr = await contract.fungiblesMap(collectionId);
        const bondedContract = BondedERC20.at(addr);

        const totalSupply = await bondedContract.totalSupply();
        const poolBalance = await bondedContract.poolBalance();

        const tokensAmount = await bondedContract.balanceOf(anotherone);

        console.log("tokensAmount->", web3.fromWei(tokensAmount).toString());

        // Is important to call this method from msg owner of the collection we;re quering.
        const valueToReceive = await contract.estimateValue(
          collectionId,
          tokensAmount, {
            from: anotherone
          }
        );

        console.log("valueToReceive->", web3.fromWei(valueToReceive).toString());
        console.log("totalSupply ->", web3.fromWei(totalSupply).toString());
        console.log("poolBalance ->", web3.fromWei(poolBalance).toString());
        console.log("--------------");

        const { receipt, logs } = await contract.sellShares(collectionId, tokensAmount, {
          from: anotherone,
          gasPrice: 26e9
        });

        for (let l of logs) {
          if (l.event == 'BurnBondedERC20') {
            console.log("VALUE :: ", l.args.tokenId, " -> ", web3.fromWei(l.args.value).toString());
          }
          if (l.event == 'TransferBondedERC20') {
            console.log("AMOUNT ::", l.args.tokenId, " -> ", web3.fromWei(l.args.amount).toString());
          }
          if (l.event == 'Log') {
            console.log(l.args.log, "::", l.args.val.toString());
          }
        }

        console.log("gas ->", receipt.gasUsed);
      });

    });
  });

}