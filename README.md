# Contracts for [!TradeStars App](https://tradestars.app).
[![Build Status](https://travis-ci.com/tradestars-app/tradestars-contracts.svg?branch=master)](https://travis-ci.com/tradestars-app/tradestars-contracts)

## Main Contracts

### PerformanceCard.sol
Performance Cards manager contract.

### PerformanceCollection.sol
Performance Collection manager contract

### BondedERC20.sol
Transferable ERC20 registry. Tokens are created and destroyed by the owner NFT and represents a fraction of it.

### FractionableERC721.sol
Fractionable ERC721 registry.

## Dependencies
- [npm](https://www.npmjs.com/): v6.9.0.

## Build and Test
Clone the project repository and enter the root directory:

```
$ git clone git@github.com:tradestars-app/tradestars-cards.git
$ cd tradestars-cards
```

Install project dependencies:

```bash
$ npm install
```

## Local Test Example

Run a local ganache instance as:

```bash
$ ganache-cli -d
$ npm run test --network local
```

Publish the project to the network.

```bash
npx openzeppelin session --network ropsten
npx openzeppelin create
```