/**
 * @param orderId a unique number for the order
 * @param expiration expiration ts of the order
 * @param tokenAddress is the ERC20/ERC721 registry where the user holds its tokens
 * @param tokenAmount amount or tokenId in case of calling a ERC721 implementing ERC721 contract
 * @param spenderAddress should be the address of the calling contract
 */
function getOrderTypedData(
  orderId,
  expiration,
  tokenAddress,
  tokenAmount,
  spenderAddress,
  fromAddress
) {

  const domain = [
    { name: 'name', type: 'string' },
    { name: 'version', type: 'string' },
    { name: 'chainId', type: 'uint256' },
    { name: 'verifyingContract', type: 'address' }
  ];

  const message = [
    { name: 'spender', type: 'address' },
    { name: 'from', type: 'address' },
    { name: 'tokenAmount', type: 'uint256' },
    { name: 'data', type: 'bytes32' },
    { name: 'expiration', type: 'uint256' },
  ];

  const orderDataHash = web3.utils.soliditySha3(
    { type: 'bytes32', value: orderId },
    { type: 'address', value: tokenAddress },
    { type: 'uint256', value: tokenAmount }
  );

  // console.log('orderDataHash ::', orderDataHash)

  return {
    types: {
      EIP712Domain: domain,
      TokenTransferOrder: message,
    },
    primaryType: 'TokenTransferOrder',
    domain: {
      name: 'TradeStars',
      version: '1.0',
      chainId: 31337, // should come as parameter
      verifyingContract: tokenAddress
    },
    message: {
      spender: spenderAddress, // This contract address
      from: fromAddress,
      tokenAmount,
      data: orderDataHash,
      expiration,
    },
  };
}

module.exports = { getOrderTypedData }
