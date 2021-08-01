# Main protocol contracts for [TradeStars](https://tradestars.app).
[![Build Status](https://travis-ci.com/tradestars-app/tradestars-contracts.svg?branch=master)](https://travis-ci.com/tradestars-app/tradestars-contracts)

## Main Contracts

### PerformanceCard.sol (NFTRegistry)
Performance Cards manager contract.

### BondedERC20.sol
Transferable ERC20 registry. Tokens are minted() and burned() by the owner NFT.

### FractionableERC721.sol
Fractionable ERC721 registry.

## Build and Test
Clone the project repository and enter the root directory:

```
$ npm i --global hardhat

$ git clone git@github.com:tradestars-app/tradestars-cards.git
$ cd tradestars-cards

$ npm install 
$ npx hardhat test --network hardhat
```


