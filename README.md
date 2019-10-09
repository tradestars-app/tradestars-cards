# Contracts for TradeStars App.
[![Build Status](https://travis-ci.com/tradestars-app/tradestars-contracts.svg?branch=master)](https://travis-ci.com/tradestars-app/tradestars-contracts)

## Main Contracts

### PerformanceCard.sol
ERC721 registry for Performance Cards.

### PerformanceCollection.sol
ERC721 registry for Performance Collections.

### BondedERC20.sol
Tansferable ERC-20 registry. Tokens are created and destroyed by the holding NFT and represents a fraction of it.

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
$ ganache-cli --port 8545 --deterministic
$ npm test
```

Publish the project to a network.

```bash
npx openzeppelin session --network ropsten
npx openzeppelin create
```