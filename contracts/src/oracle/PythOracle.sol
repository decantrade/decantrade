// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracle} from "../interfaces/IOracle.sol";

/// @dev Minimal subset of the Pyth price feed interface.
interface IPyth {
    struct Price {
        int64 price;
        uint64 conf;
        int32 expo;
        uint256 publishTime;
    }

    /// @notice Returns the price if it is no older than `age` seconds, else reverts.
    function getPriceNoOlderThan(bytes32 id, uint256 age) external view returns (Price memory);

    /// @notice Returns the most recent price without any staleness check.
    function getPriceUnsafe(bytes32 id) external view returns (Price memory);
}

/// @title PythOracle
/// @notice Adapts a Pyth price feed (e.g. ETH/USD, BTC/USD on Base) to Decant's
///         IOracle (USD per token, 1e18-scaled). Reverts if the price is stale.
contract PythOracle is IOracle {
    IPyth public immutable pyth;
    bytes32 public immutable priceId;
    uint256 public immutable maxAge; // seconds

    constructor(IPyth _pyth, bytes32 _priceId, uint256 _maxAge) {
        pyth = _pyth;
        priceId = _priceId;
        maxAge = _maxAge;
    }

    function getPrice() external view returns (uint256) {
        IPyth.Price memory p = pyth.getPriceNoOlderThan(priceId, maxAge);
        require(p.price > 0, "BAD_PRICE");
        uint256 raw = uint256(uint64(p.price));
        // Convert to 1e18: value = raw * 10^(18 + expo). Pyth expo is typically negative.
        int256 targetExpo = int256(18) + int256(p.expo);
        if (targetExpo >= 0) {
            return raw * (10 ** uint256(targetExpo));
        } else {
            return raw / (10 ** uint256(-targetExpo));
        }
    }
}
