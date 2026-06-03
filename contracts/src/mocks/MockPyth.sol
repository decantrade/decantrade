// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IPyth} from "../oracle/PythOracle.sol";

/// @notice Settable Pyth stub for tests. Stores one price per feed id.
contract MockPyth is IPyth {
    mapping(bytes32 => Price) internal prices;

    function setPrice(bytes32 id, int64 price, int32 expo) external {
        prices[id] = Price({price: price, conf: 0, expo: expo, publishTime: block.timestamp});
    }

    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory) {
        Price memory p = prices[id];
        require(p.publishTime != 0 && block.timestamp - p.publishTime <= age, "STALE");
        return p;
    }

    function getPriceUnsafe(bytes32 id) external view returns (Price memory) {
        return prices[id];
    }
}
