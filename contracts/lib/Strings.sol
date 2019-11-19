pragma solidity ^0.5.12;

/**
 * @title Strings
 * @dev Assorted String operations
 */
library Strings {

    /**
     * @dev Contatenates two strings
     * @param _a base string
     * @param _b string to contatenate
     */
    function strConcat(string memory _a, string memory _b) internal pure returns (string memory) {
        bytes memory _ba = bytes(_a);
        bytes memory _bb = bytes(_b);

        bytes memory ret = bytes(
            new string(_ba.length + _bb.length)
        );

        uint k = 0;

        for (uint i = 0; i < _ba.length; i++) {
            ret[k++] = _ba[i];
        }

        for (uint i = 0; i < _bb.length; i++) {
            ret[k++] = _bb[i];
        }

        return string(ret);
    }

    function uint2str(uint _input) internal pure returns (string memory _uintAsString) {
        uint _i = _input;

        if (_i == 0) {
            return "0";
        }

        uint j = _i;
        uint len;

        while (j != 0) {
            len++;
            j /= 10;
        }

        bytes memory bstr = new bytes(len);
        uint k = len - 1;

        while (_i != 0) {
            bstr[k--] = byte(uint8(48 + _i % 10));
            _i /= 10;
        }

        return string(bstr);
    }
}