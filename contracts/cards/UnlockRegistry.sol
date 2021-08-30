// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

import "./IUnlockRegistry.sol";
import "../commons/OperationManaged.sol";


contract UnlockRegistry is OperationManaged, IUnlockRegistry {
    
    // mapping for liquidity contributors
    mapping(uint256 => LiquidityInfo) private liquidityContributors;

    function _removeFromMapping(
        LiquidityInfo storage t, 
        address _sender
    ) 
        private 
    {
        // remove from array 
        uint256 index = t.index[_sender];
        
        // remove last and place it in current deleted item
        address lastItem = t.senders[t.senders.length - 1];

        // set last item in place of deleted
        t.senders[index] = lastItem;
        t.senders.pop();

        // update index map
        t.index[lastItem] = index; 
        
        // delete removed address from index map
        delete t.index[_msgSender()];

        // remove previous contribution
        t.total -= t.contributions[_sender];
    }

    function _addToMapping(
        LiquidityInfo storage t,
        address _sender, 
        uint256 _amount
    ) 
        private
    {
        // save contributor address 
        t.contributions[_sender] = _amount;
        t.index[_sender] = t.senders.length;
        
        // add contributor to senders list
        t.senders.push(_sender);

        // add to total 
        t.total += _amount;
    }

    function getContributorsFor(uint256 _tokenId) 
        external 
        view
        override 
        returns (address[] memory) 
    {    
        return liquidityContributors[_tokenId].senders;
    }
    
    function getSenderContributionFor(address _sender, uint256 _tokenId) 
        external 
        view
        override 
        returns (uint256 contribution) 
    {
        return liquidityContributors[_tokenId].contributions[_sender];  
    }

    function clearContributorsFor(uint256 _tokenId) external override onlyOperationManager {
        delete liquidityContributors[_tokenId];
    }

    /**
     * Adds contribution to unlock
     * @param _tokenId tokenId to liquidate
     * @param _sender sender of the contribution
     * @param _amount liquidity provided to contribution
     * @param _tokenIdMaxAmount min amount fot the asset thats needed to unlock
     */
    function addContribution(
        uint256 _tokenId, 
        address _sender, 
        uint256 _amount,
        uint256 _tokenIdMaxAmount
    ) 
        external override onlyOperationManager returns (uint256, bool) 
    {
        LiquidityInfo storage t = liquidityContributors[_tokenId];

        // refund prev contribution
        uint256 refund = t.contributions[_sender];
        
        if (refund > 0) {
            _removeFromMapping(t, _sender);
        }

        // checks if total amount > max allowed and refund 
        uint256 postContribution = t.total + _amount;

        if (postContribution > _tokenIdMaxAmount) {
            refund += postContribution - _tokenIdMaxAmount;
            _amount = _tokenIdMaxAmount - t.total;
        }

        _addToMapping(t, _sender, _amount);

        emit LiquidityContribution(_sender, _tokenId, _amount);

        // return if contribution is completed
        return (refund, t.total == _tokenIdMaxAmount);
    }
}