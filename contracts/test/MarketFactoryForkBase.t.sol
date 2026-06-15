// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFactory, IUniV3Factory} from "../src/MarketFactory.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {UniswapV3TwapOracle} from "../src/oracle/UniswapV3TwapOracle.sol";
import {IPyth} from "../src/oracle/PythOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockUniV3Pool} from "../src/mocks/MockUniV3Pool.sol";

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
        vm.createSelectFork(rpc);
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
}
