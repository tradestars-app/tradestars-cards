const { web3 } = require('@openzeppelin/test-environment')

/**
 * @param orderId a unique number for the order
 * @param expiration expiration ts of the order
 * @param tokenAddress is the ERC20/ERC721 registry where the user holds its tokens
 * @param tokenIdOrAmount amount or tokenId in case of calling a ERC721 implementing ERC721 contract
 * @param spenderAddress should be the address of the calling contract
 */
function getOrderTypedData(
  orderId,
  expiration,
  tokenAddress,
  tokenIdOrAmount,
  spenderAddress
) {

  const domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' },
  ];

  const message = [
    { name: 'spender', type: 'address' },
    { name: 'tokenIdOrAmount', type: 'uint256' },
    { name: 'data', type: 'bytes32' },
    { name: 'expiration', type: 'uint256' },
  ];

  const orderDataHash = web3.utils.soliditySha3(
    { type: 'bytes32', value: orderId },
    { type: 'address', value: tokenAddress },
    { type: 'uint256', value: tokenIdOrAmount }
  );

  // console.log('orderDataHash:', orderDataHash)

  return {
    types: {
      EIP712Domain: domain,
      TokenTransferOrder: message,
    },
    primaryType: 'TokenTransferOrder',
    domain: {
      name: 'Matic Network',
      version: '1',
      chainId: 15001, // should come as paramenter
      verifyingContract: tokenAddress,
    },
    message: {
      spender: spenderAddress, // This contract address
      tokenIdOrAmount,
      data: orderDataHash,
      expiration,
    },
  };
}

module.exports = { getOrderTypedData }
