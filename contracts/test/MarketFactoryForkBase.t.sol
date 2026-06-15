// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFactory, IUniV3Factory} from "../src/MarketFactory.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {UniswapV3TwapOracle} from "../src/oracle/UniswapV3TwapOracle.sol";
import {IPyth} from "../src/oracle/PythOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockUniV3Pool} from "../src/mocks/MockUniV3Pool.sol";

interface IV3SwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        uint24 fee;
        address recipient;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 sqrtPriceLimitX96;
    }
    function exactInputSingle(ExactInputSingleParams calldata params) external payable returns (uint256 amountOut);
}

interface IPoolSlot0 {
    function slot0()
        external
        view
        returns (
            uint160 sqrtPriceX96,
            int24 tick,
            uint16 observationIndex,
            uint16 observationCardinality,
            uint16 observationCardinalityNext,
            uint8 feeProtocol,
            bool unlocked
        );
}

interface IERC20Approve {
    function approve(address spender, uint256 amount) external returns (bool);
}

/// @notice Fork test against live Base mainnet. Proves the TWAP guardrails work against
///         the REAL Uniswap V3 factory: a genuine WETH/USDC pool launches a market with
///         a sane index price + 2x cap, while a forged pool (same tokens/fee, attacker
///         contract) is rejected by the canonical-pool check.
///
/// Gated on BASE_FORK_RPC so the offline suite skips it. Run with:
///   BASE_FORK_RPC=https://mainnet.base.org forge test --match-contract MarketFactoryForkBaseTest -vv
contract MarketFactoryForkBaseTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    address constant WETH = 0x4200000000000000000000000000000000000006;
    address constant UNIV3_FACTORY = 0x33128a8fC17869897dcE68Ed026d694621f6FDfD;

    address governor = address(0xA0);
    address alice = address(0xA11CE);
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        // Pin a recent block so the fork-state cache is reused across runs and the
        // TWAP/manipulation results are deterministic. Override with BASE_FORK_BLOCK.
        uint256 blk = vm.envOr("BASE_FORK_BLOCK", uint256(47385000));
        vm.createSelectFork(rpc, blk);
        forked = true;
    }

    function test_Fork_RealPoolAccepted_ForgedRejected() public {
        if (!forked) {
            emit log("BASE_FORK_RPC unset - skipping Base mainnet fork test");
            return;
        }

        // The canonical WETH/USDC 0.05% pool, resolved from the real factory.
        address pool = IUniV3Factory(UNIV3_FACTORY).getPool(WETH, USDC, 500);
        assertTrue(pool != address(0), "WETH/USDC 0.05% pool exists on Base");

        MarketFactory factory = new MarketFactory(IERC20(USDC), IPyth(address(0)), governor, UNIV3_FACTORY);

        // Read the real TWAP price to size reserves so the seeded mark starts in-band.
        UniswapV3TwapOracle probe = new UniswapV3TwapOracle(pool, WETH, USDC, 1800);
        uint256 idx = probe.getPrice();
        emit log_named_decimal_uint("WETH/USDC TWAP index", idx, 18);
        assertGt(idx, 100e18, "ETH index sane (> $100)");

        uint256 baseReserve = 1_000e18;
        uint256 quoteReserve = baseReserve * idx / 1e18; // mark == idx exactly

        vm.prank(alice);
        address mkt = factory.createTwapMarket(pool, WETH, 1800, baseReserve, quoteReserve);
        assertEq(PerpMarket(mkt).owner(), governor, "owned by governor");
        assertEq(PerpMarket(mkt).maxLeverage(), 2e18, "2x cap on factory TWAP market");
        assertApproxEqRel(PerpMarket(mkt).getIndexPrice(), idx, 0.001e18, "market index == pool TWAP");

        // A forged pool with the same tokens/fee but NOT deployed by the canonical
        // factory must be rejected — this is the fake-oracle attack vector.
        MockUniV3Pool forged = new MockUniV3Pool(WETH, USDC, 887000); // absurd tick
        forged.setFee(500);
        vm.prank(alice);
        vm.expectRevert(bytes("POOL_NOT_CANONICAL"));
        factory.createTwapMarket(address(forged), WETH, 1800, baseReserve, quoteReserve);
    }

    // SwapRouter02 on Base.
    address constant SWAP_ROUTER = 0x2626664c2603336E57B271c5C0b26F421741e481;

    /// @notice Exploit sim: a whale pumps the REAL WETH/USDC pool spot price in one
    ///         block, then the 30-min TWAP that prices the market is re-read 30s later.
    ///         Because PnL is index-priced off the TWAP (not spot), the manipulation is
    ///         diluted to ~window-fraction of its size — so it cannot mint meaningful
    ///         PnL, while the spot move cost the attacker a large swap on a deep pool.
    function test_Fork_TwapDilutesSpotManipulation() public {
        if (!forked) {
            emit log("BASE_FORK_RPC unset - skipping Base mainnet fork test");
            return;
        }

        address pool = IUniV3Factory(UNIV3_FACTORY).getPool(WETH, USDC, 500);
        UniswapV3TwapOracle oracle = new UniswapV3TwapOracle(pool, WETH, USDC, 1800);

        uint256 idxBefore = oracle.getPrice();
        (, int24 tickBefore,,,,,) = IPoolSlot0(pool).slot0();
        emit log_named_decimal_uint("TWAP index before    ", idxBefore, 18);

        // Whale buys WETH with $40M USDC, pushing spot WETH/USDC up hard.
        address whale = makeAddr("whale");
        uint256 amountIn = 40_000_000e6;
        deal(USDC, whale, amountIn, true);
        vm.startPrank(whale);
        IERC20Approve(USDC).approve(SWAP_ROUTER, amountIn);
        IV3SwapRouter(SWAP_ROUTER).exactInputSingle(
            IV3SwapRouter.ExactInputSingleParams({
                tokenIn: USDC,
                tokenOut: WETH,
                fee: 500,
                recipient: whale,
                amountIn: amountIn,
                amountOutMinimum: 0,
                sqrtPriceLimitX96: 0
            })
        );
        vm.stopPrank();

        (, int24 tickAfter,,,,,) = IPoolSlot0(pool).slot0();
        // Relative spot move = 1.0001^(tickAfter - tickBefore) - 1. Tick delta from a
        // single swap is small, so power over the delta is cheap and exact enough.
        uint256 spotMoveBps = _spotMoveBps(tickAfter - tickBefore);
        emit log_named_int("tick before          ", tickBefore);
        emit log_named_int("tick after pump      ", tickAfter);
        emit log_named_uint("spot move (bps)      ", spotMoveBps);

        // Hold the manipulated price for 30s, then re-read the 30-min TWAP.
        vm.warp(block.timestamp + 30);
        uint256 idxAfter = oracle.getPrice();
        uint256 twapMoveBps = idxAfter > idxBefore ? (idxAfter - idxBefore) * 10_000 / idxBefore : 0;
        emit log_named_decimal_uint("TWAP index after 30s ", idxAfter, 18);
        emit log_named_uint("TWAP move (bps)      ", twapMoveBps);

        // The spot was meaningfully moved by the $40M swap...
        assertGt(spotMoveBps, 100, "spot moved > 1% from the pump");
        // ...yet the TWAP that actually prices PnL barely budged: the 30s of
        // manipulation is diluted across the 1800s window (<= ~1/20th of spot move).
        assertLt(twapMoveBps, spotMoveBps / 10, "TWAP move heavily diluted vs spot");
        emit log("OK: index-priced PnL resists single-block TWAP manipulation");
    }

    /// @dev Relative spot move in bps from a tick delta: 1.0001^delta - 1, via
    ///      exponentiation-by-squaring (cheap for any delta). Buying WETH raises
    ///      the USDC/WETH tick, so delta is expected positive.
    function _spotMoveBps(int24 delta) internal pure returns (uint256) {
        require(delta >= 0, "unexpected price drop");
        uint256 d = uint256(uint24(delta));
        uint256 result = 1e18;
        uint256 base = 1000100000000000000; // 1.0001e18
        while (d > 0) {
            if (d & 1 == 1) result = result * base / 1e18;
            base = base * base / 1e18;
            d >>= 1;
        }
        return result > 1e18 ? (result - 1e18) * 10_000 / 1e18 : 0;
    }
}
