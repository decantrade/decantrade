// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IOracle} from "../interfaces/IOracle.sol";
import {IERC20} from "../interfaces/IERC20.sol";
import {TickMath} from "../libraries/TickMath.sol";
import {FullMath} from "../libraries/FullMath.sol";

interface IUniswapV3PoolMinimal {
    function token0() external view returns (address);
    function token1() external view returns (address);
    /// @notice Returns cumulative tick and liquidity values as of `secondsAgos` from now.
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128);
}

/// @title UniswapV3TwapOracle
/// @notice Index price for a token that has no Pyth feed, derived from a Uniswap V3
///         pool's time-weighted average tick. Used as the permissionless fallback so
///         Decant can list a perp on "any token" with a DEX pool. Returns USD per base
///         token (1e18-scaled), where the pool's quote token is the USD stablecoin.
///
/// @dev TWAP windows resist single-block manipulation but are NOT a substitute for a
///      high-quality oracle on thin pools — markets created on shallow liquidity are
///      inherently riskier. The factory enforces a minimum window.
contract UniswapV3TwapOracle is IOracle {
    IUniswapV3PoolMinimal public immutable pool;
    address public immutable baseToken; // the token being priced
    address public immutable quoteToken; // the USD stablecoin in the pool
    uint32 public immutable twapWindow; // seconds
    uint256 public immutable baseUnit; // 10**baseDecimals
    uint256 public immutable quoteDecimalsPow; // 10**quoteDecimals

    constructor(address _pool, address _baseToken, address _quoteToken, uint32 _twapWindow) {
        require(_twapWindow > 0, "WINDOW");
        address t0 = IUniswapV3PoolMinimal(_pool).token0();
        address t1 = IUniswapV3PoolMinimal(_pool).token1();
        require(
            (_baseToken == t0 && _quoteToken == t1) || (_baseToken == t1 && _quoteToken == t0), "TOKENS_NOT_IN_POOL"
        );
        pool = IUniswapV3PoolMinimal(_pool);
        baseToken = _baseToken;
        quoteToken = _quoteToken;
        twapWindow = _twapWindow;
        baseUnit = 10 ** IERC20(_baseToken).decimals();
        quoteDecimalsPow = 10 ** IERC20(_quoteToken).decimals();
    }

    /// @inheritdoc IOracle
    function getPrice() external view returns (uint256) {
        int24 avgTick = _consult();
        // quote token amount for one whole base token, in quote's smallest units.
        uint256 quoteAmount = _getQuoteAtTick(avgTick, baseUnit, baseToken, quoteToken);
        require(quoteAmount > 0, "ZERO_PRICE");
        // Scale to 1e18 USD/token.
        return quoteAmount * 1e18 / quoteDecimalsPow;
    }

    /// @dev Arithmetic-mean tick over the TWAP window.
    function _consult() internal view returns (int24) {
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow;
        secondsAgos[1] = 0;
        (int56[] memory tickCumulatives,) = pool.observe(secondsAgos);
        int56 delta = tickCumulatives[1] - tickCumulatives[0];
        int24 avgTick = int24(delta / int56(uint56(twapWindow)));
        // Round toward negative infinity, matching Uniswap's OracleLibrary.
        if (delta < 0 && (delta % int56(uint56(twapWindow)) != 0)) avgTick--;
        return avgTick;
    }

    /// @dev Given a tick and a base amount, returns the equivalent quote amount.
    ///      Vendored from Uniswap's OracleLibrary.getQuoteAtTick.
    function _getQuoteAtTick(int24 tick, uint256 baseAmount, address base, address quote)
        internal
        pure
        returns (uint256 quoteAmount)
    {
        uint160 sqrtRatioX96 = TickMath.getSqrtRatioAtTick(tick);
        if (sqrtRatioX96 <= type(uint128).max) {
            uint256 ratioX192 = uint256(sqrtRatioX96) * sqrtRatioX96;
            quoteAmount = base < quote
                ? FullMath.mulDiv(ratioX192, baseAmount, 1 << 192)
                : FullMath.mulDiv(1 << 192, baseAmount, ratioX192);
        } else {
            uint256 ratioX128 = FullMath.mulDiv(sqrtRatioX96, sqrtRatioX96, 1 << 64);
            quoteAmount = base < quote
                ? FullMath.mulDiv(ratioX128, baseAmount, 1 << 128)
                : FullMath.mulDiv(1 << 128, baseAmount, ratioX128);
        }
    }
}
