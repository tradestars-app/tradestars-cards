require('babel-register');
require('babel-polyfill');

require('dotenv').config();

const HDWalletProvider = require('@truffle/hdwallet-provider');

const mnemonic = process.env.MNEMONIC;
const infuraKey = process.env.INFURA_API_KEY;

module.exports = {
  networks: {
    local: {
      host: 'localhost',
      port: 8545,
      gas: 5500000,
      gasPrice: 5e9,
      network_id: '*'
    },
    ropsten: {
      provider: () => new HDWalletProvider(mnemonic, `https://ropsten.infura.io/v3/${infuraKey}`),
      gas: 5500000,
      gasPrice: 5e9,
      network_id: '3'
    },
    mainnet: {
      provider: () => new HDWalletProvider(mnemonic, `https://mainnet.infura.io/v3/${infuraKey}`),
      gas: 5500000,
      gasPrice: 5e9,
      network_id: '1'
    },
    matic: {
      provider: () => new HDWalletProvider(mnemonic, `https://testnet2.matic.network`),
      gas: 5500000,
      gasPrice: 0,
      network_id: '*',
      confirmations: 2
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