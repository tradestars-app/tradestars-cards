const { keccak256, setLengthLeft, toBuffer } = require('ethereumjs-util');

/**
 * @param chainId chainId where the TX will be executed
 * @param orderId a unique number for the order
 * @param expiration expiration ts of the order
 * @param tokenAddress is the ERC20/ERC721 registry where the user holds its tokens
 * @param tokenIdOrAmount amount or tokenId in case of calling a ERC721 implementing ERC721 contract
 * @param spenderAddress should be the address of the calling contract
 */
export function getOrderTypedData(
  chainId,
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

  const orderData = Buffer.concat([
    toBuffer(orderId),
    toBuffer(tokenAddress),
    setLengthLeft('0x' + web3.utils.toBN(tokenIdOrAmount).toString(16), 32),
  ]);

  const orderDataHash = keccak256(orderData);

  return {
    types: {
      EIP712Domain: domain,
      TokenTransferOrder: message,
    },
    primaryType: 'TokenTransferOrder',
    domain: {
      name: 'TradeStars App',
      version: '1',
      chainId, // should come as paramenter
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