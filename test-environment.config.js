// test-environment.config.js

module.exports = {
  node: { // Options passed directly to Ganache client
    gasLimit: 8e6, // Maximum gas per block
    gasPrice: 20e9, // Sets the default gas price for transactions if not otherwise specified.
    network_id: 15001 //
  },
};
