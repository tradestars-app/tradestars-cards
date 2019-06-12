require('babel-register');
require('babel-polyfill');

const HDWalletProvider = require('truffle-hdwallet-provider');
const mnemonic = process.env.WALLET_MNEMONIC;

module.exports = {
  networks: {
    local: {
      host: 'localhost',
      port: 9545,
      gas: 6721975,
      network_id: '2',
    },
    mainnet: {
      network_id: 1,
      gas: 6721975,
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://mainnet.infura.io/${process.env.INFURA_API_KEY}`)
      }
    }
  },
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  mocha: {
    timeout: 10000,
    slow: 3000
  }
};