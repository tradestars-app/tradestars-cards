# Contracts for TradeStars App.
[![Build Status](https://travis-ci.com/tradestars-app/tradestars-contracts.svg?branch=master)](https://travis-ci.com/tradestars-app/tradestars-contracts)

## Game Design

### Performance Cards
Performance cards are the main item on the game. These tokens are non-fungible digital assets that represents a sport performance.

### Collection Collections
Collection Cards are composable non-fungible tokens and allows a user to trade on several Performance Tokens at the same time.

### Performance Smart Tokens
These tokens are transferable ERC-20 tokens, that are created and destroyed by the holding NFT. Each of these tokens represents a fraction of the Performance Card.

## Dependencies
- [npm](https://www.npmjs.com/): v6.2.0.
- [zos](https://www.npmjs.com/package/zos): v1.0.0

You can check if the dependencies are installed correctly by running the following command:

```
$ npm --version
6.2.0
$ zos --version
1.0.0
```

## Build and Test
After installing the dependencies previously mentioned, clone the project repository and enter the root directory:

```
$ git clone git@github.com:tradestars-app/tradestars-cards.git
$ cd tradestars-cards
```

Then, install ZeppelinOS and project dependencies:

```
$ npm install --global zos
$ $ npm install`
```

## Local Example

Run a local ganache instance as:

`$ ganache-cli --port 9545 --deterministic -e 100`

Build and deploy contracts

```
npx zos session --network local --from 0x1df62f291b2e969fb0849d99d9ce41e2f137006e --expires 3600
npx zos push --deploy-dependencies
```

Run package unit tests

`$ npm test`
