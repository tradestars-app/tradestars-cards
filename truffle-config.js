require('babel-register');
require('babel-polyfill');

require('dotenv').config();

const HDWalletProvider = require('truffle-hdwallet-provider');
const mnemonic = process.env.MNEMONIC;

module.exports = {
  networks: {
    test: {
      network_id: '*',
      host: 'localhost',
      port: 9545,
      gas: 6000000,
      gasPrice: 10000000000,
    },
    ropsten: {
      network_id: 3,
      gas: 6000000,
      gasPrice: 10000000000,
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${process.env.INFURA_API_KEY}`)
      }

    },
    mainnet: {
      network_id: 1,
      gas: 6000000,
      gasPrice: 10000000000,
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`)
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