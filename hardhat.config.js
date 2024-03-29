require("@nomiclabs/hardhat-truffle5");
require("solidity-coverage");

module.exports = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {
      allowUnlimitedContractSize: true,
      gas: 5500000,
      gasPrice: 5e9
    },
  },
  solidity: { 
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};