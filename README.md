# Main protocol contracts for [TradeStars](https://tradestars.app).
[![Build Status](https://travis-ci.com/tradestars-app/tradestars-contracts.svg?branch=master)](https://travis-ci.com/tradestars-app/tradestars-contracts)

## Main Contracts

### PerformanceCard.sol
Performance Cards manager contract.

### BondedERC20.sol
Transferable ERC20 registry. Tokens are minted() and burned() by the owner NFT.

### FractionableERC721.sol
Fractionable ERC721 registry.

## Build and Test
Clone the project repository and enter the root directory:

```
$ git clone git@github.com:tradestars-app/tradestars-cards.git
$ cd tradestars-cards
```

Install project dependencies:

```bash
$ npm install
$ npm run test
```


## Matic - Mumbai
```
BondedERC20Helper: 0x98193ea10AE8AC2732DA62a04e0C39E009CAFAE3
FractionableERC721: 0x3D4237C443B826fc024aa462513Ac6013058E237

PerformanceCard: 0xBF5B3dF771871E76D040afE03730ea37acFec7d4

ReserveToken (sTSX): 0x457E7C683CCf8e64F1DDA0Ff0ffE6403b002e15d
```


