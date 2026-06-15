// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPoolLike {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
}

/// @notice Minimal Uniswap V3 factory stub: registers a pool so `getPool` returns it,
///         mirroring the canonical factory used by MarketFactory's authenticity check.
///         Pools NOT registered here resolve to address(0) — exactly how a forged pool
///         contract would fail the check on mainnet.
contract MockUniV3Factory {
    mapping(address => mapping(address => mapping(uint24 => address))) public getPool;

    /// @dev Register a real pool (both token orderings, like the canonical factory).
    function register(address pool) external {
        address t0 = IPoolLike(pool).token0();
        address t1 = IPoolLike(pool).token1();
        uint24 fee = IPoolLike(pool).fee();
        getPool[t0][t1][fee] = pool;
        getPool[t1][t0][fee] = pool;
    }
}
