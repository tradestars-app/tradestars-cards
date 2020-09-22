const { web3 } = require('@openzeppelin/test-environment')

const BN = web3.utils.BN
const expect = require('chai')
  .use(require('bn-chai')(BN))
  .expect

async function balanceSnap(token, address, account) {
  let snapBalance = await token.balanceOf(address)
  return {
    current: function () {
      return snapBalance.toString();
    },
    requireConstant: async function () {
      expect(
        snapBalance,
        `${account} balance should remain constant`
      ).to.eq.BN(
        await token.balanceOf(address)
      )
    },
    requireIncrease: async function (delta) {
      const realincrease = (await token.balanceOf(address)).sub(snapBalance)
      const expectedBalance = snapBalance.add(delta)
      expect(
        snapBalance.add(delta),
        `${account} should increase by ${delta} - but increased by ${realincrease}`
      ).to.eq.BN(
        await token.balanceOf(address)
      )
      // Update balance
      snapBalance = expectedBalance
    },
    requireDecrease: async function (delta) {
      const realdecrease = snapBalance.sub(await token.balanceOf(address))
      const expectedBalance = snapBalance.sub(delta)
      expect(
        snapBalance.sub(delta),
        `${account} should decrease by ${delta} - but decreased by ${realdecrease}`
      ).to.eq.BN(
        await token.balanceOf(address)
      )
      // Update balance
      snapBalance = expectedBalance
    },
    restore: async function () {
      await token.setBalance(snapBalance, address)
    }
  }
}

async function etherSnap(address, account) {
  let snapBalance = new BN(await web3.eth.getBalance(address))
  return {
    requireConstant: async function () {
      expect(
        snapBalance,
        `${account} balance should remain constant`
      ).to.eq.BN(
        await web3.eth.getBalance(address)
      )
    },
    requireIncrease: async function (delta) {
      const realincrease = new BN(await web3.eth.getBalance(address)).sub(snapBalance)
      const expectedBalance = snapBalance.add(delta)
      expect(
        expectedBalance,
        `${account} should increase by ${delta} - but increased by ${realincrease}`
      ).to.eq.BN(
        new BN(await web3.eth.getBalance(address))
      )
      // Update balance
      snapBalance = expectedBalance
    },
    requireDecrease: async function (delta) {
      const realdecrease = snapBalance.sub(new BN(await web3.eth.getBalance(address)))
      const expectedBalance = snapBalance.sub(delta)
      expect(
        snapBalance.sub(delta),
        `${account} should decrease by ${delta} - but decreased by ${realdecrease}`
      ).to.eq.BN(
        new BN(await web3.eth.getBalance(address))
      )
      // Update balance
      snapBalance = expectedBalance
    }
  }
}


module.exports = { etherSnap, balanceSnap }
