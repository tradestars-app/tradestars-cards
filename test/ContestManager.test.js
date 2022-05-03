const { 
  BN, // big number
  time, // time helpers
  expectEvent, // Assertions for emitted events
  expectRevert, // Assertions for transactions that should fail
} = require('@openzeppelin/test-helpers');

const { toBN, toWei } = require('web3-utils');
const { balanceSnap } = require('./helpers/balanceSnap')

const { expect } = require('chai');

const ERC20 = artifacts.require('MockERC20');
const ContestManager = artifacts.require('ContestManager');

contract('ContestManager', function (accounts) {

const [ owner, someone, anotherone ] = accounts;
const initialSupply = toBN(10000);
const rewardsPerSecond = toBN(1000);

});