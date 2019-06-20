require('babel-register');
require('babel-polyfill');

require('dotenv').config();

const HDWalletProvider = require('truffle-hdwallet-provider');

const mnemonic = process.env.MNEMONIC;
const infuraKey = process.env.INFURA_API_KEY;

module.exports = {
  networks: {
    local: {
      host: 'localhost',
      port: 9545,
      gas: 6721975,
      gasPrice: 5e9,
      network_id: '*',
      websockets: true
    },
    ropsten: {
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${infuraKey}`)
      },
      gas: 6721975,
      gasPrice: 5e9,
      network_id: 3

    },
    mainnet: {
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://mainnet.infura.io/v3/${infuraKey}`)
      },
      gas: 5000000,
      gasPrice: 5e9,
      network_id: 1
    }
  },
  compilers: {
    solc: {
      settings: {
        optimizer: {
          enabled: true,
          runs: 200
        }
      }
    }
  },
  mocha: {
    timeout: 10000,
    slow: 30000
  }
};