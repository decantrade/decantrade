// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Index price source for a market. Price is USD per 1 token, scaled to 1e18.
interface IOracle {
    /// @return price USD per token, 1e18-scaled. Must revert if stale/invalid.
    function getPrice() external view returns (uint256 price);
}
