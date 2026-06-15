// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Uniswap V3 pool stub for tests: returns tickCumulatives implied by a
///         constant tick, so a TWAP over any window resolves to `tick`.
contract MockUniV3Pool {
    address public token0;
    address public token1;
    int24 public tick;
    uint24 public fee = 3000; // 0.3% — overridable for getPool() matching
    uint128 public liquidity = type(uint128).max; // deep by default; lower to test floor

    constructor(address _token0, address _token1, int24 _tick) {
        // Real pools always have token0 < token1; keep the invariant.
        require(_token0 < _token1, "TOKEN_ORDER");
        token0 = _token0;
        token1 = _token1;
        tick = _tick;
    }

    function setTick(int24 _tick) external {
        tick = _tick;
    }

    function setFee(uint24 _fee) external {
        fee = _fee;
    }

    function setLiquidity(uint128 _liquidity) external {
        liquidity = _liquidity;
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128 = new uint160[](secondsAgos.length);
        // tickCumulative(now - t) = tick * (T - t); difference over window => tick * window.
        for (uint256 i = 0; i < secondsAgos.length; i++) {
            tickCumulatives[i] = int56(tick) * int56(int256(uint256(block.timestamp - secondsAgos[i])));
        }
    }
}
