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
$ ganache-cli --port 9545 --deterministic
$ npm test
```

Publish the project to a network.

```bash
npx zos session --network ropsten
npx zos push
```

Create the proxy instances:

```bash
$ zos create PerformanceCard --init --args $OWNER,$TSTOKEN,$RESERVETOKEN,$KYBERPROXY,$BONDEDHELPER --no-interactive
Deployed ProxyAdmin at 0x7ADF6b83087D2Ef673C027561896Aa694b57A4A2
Creating proxy to logic contract 0xbBE757c67015235A9E8401C8190178f860E673E4 and initializing by calling initialize with:
 - _sender (address): $OWNER
 - _tsToken (address): $TSTOKEN
 - _reserveToken (address): $RESERVETOKEN
 - _kyberProxy (address): $KYBERPROXY
 - _bondedHelper (address): $BONDEDHELPER
Instance created at 0xd73658E2A896F66F5B60cb3317a0457e8da1Fd1a
```