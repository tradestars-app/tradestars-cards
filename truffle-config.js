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
      network_id: '*',
      websockets: true,
      gas: 8000000
    },
    ropsten: {
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${infuraKey}`)
      },
      network_id: 3,
      gas: 6721975

    },
    mainnet: {
      provider: function() {
        return new HDWalletProvider(mnemonic, `https://mainnet.infura.io/v3/${infuraKey}`)
      },
      network_id: 1,
      gas: 6721975
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
    timeout: 10000000,
    slow: 30000
  }
};