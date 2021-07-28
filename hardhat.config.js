require("@nomiclabs/hardhat-truffle5");

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
    version: "0.8.0",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  }
};