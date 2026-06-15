// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {UniswapV3TwapOracle} from "../src/oracle/UniswapV3TwapOracle.sol";
import {IPyth} from "../src/oracle/PythOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPyth} from "../src/mocks/MockPyth.sol";
import {MockUniV3Pool} from "../src/mocks/MockUniV3Pool.sol";
import {MockUniV3Factory} from "../src/mocks/MockUniV3Factory.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

contract MarketFactoryTest is Test {
    bytes32 constant ETH_USD = bytes32(uint256(1));

    MockERC20 usdc;
    MockPyth pyth;
    MarketFactory factory;

    address governor = address(0xa0);
    address alice = address(0xA11CE);

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        pyth = new MockPyth();
        pyth.setPrice(ETH_USD, 2000e8, -8); // -> 2000e18 from PythOracle
        factory = new MarketFactory(IERC20(address(usdc)), IPyth(address(pyth)), governor, address(0));
    }

    // Build a canonical TWAP pool (base/quote) + a factory whose univ3Factory knows it.
    // tick 76012 => 1.0001^76012 ~= 2000 (USD per base, both 18 dec).
    function _twapSetup(int24 tick)
        internal
        returns (MarketFactory twapFactory, MockUniV3Pool pool, address base, address quote)
    {
        vm.warp(2_000_000); // ensure block.timestamp > TWAP window
        MockERC20 a = new MockERC20("Token A", "AAA", 18);
        MockERC20 b = new MockERC20("Token B", "BBB", 18);
        (base, quote) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));
        pool = new MockUniV3Pool(base, quote, tick);
        MockUniV3Factory uniFactory = new MockUniV3Factory();
        uniFactory.register(address(pool));
        twapFactory = new MarketFactory(IERC20(quote), IPyth(address(0)), governor, address(uniFactory));
    }

    function test_CreatePythMarketAndTrade() public {
        vm.prank(alice);
        address mkt = factory.createPythMarket(ETH_USD, 1000e18, 2_000_000e18);

        // Registered + owned by governor (not the creator).
        assertEq(factory.allMarketsLength(), 1);
        assertEq(factory.allMarkets(0), mkt);
        PerpMarket market = PerpMarket(mkt);
        assertEq(market.owner(), governor);
        assertEq(market.getMarkPrice(), 2000e18, "mark seeded at 2000");

        // Risk defaults propagated from the factory.
        assertEq(market.maxLeverage(), 50e18);
        assertEq(market.tradingFeeRatio(), 0.001e18);

        // The created market is fully functional: deposit + open a long.
        usdc.mint(alice, 100_000e6);
        vm.startPrank(alice);
        usdc.approve(mkt, type(uint256).max);
        market.deposit(100_000e6);
        market.openPosition(true, 10_000e18, 5e18);
        vm.stopPrank();

        (int256 size,, uint256 margin,,) = market.positions(alice);
        assertGt(size, 0, "long size positive");
        assertEq(margin, 9_950e18, "margin = 10000 - 0.1% fee");
        assertGt(market.getMarkPrice(), 2000e18, "buying pushed mark up");
    }

    function test_CreateTwapMarketPricesCorrectly() public {
        (MarketFactory twapFactory, MockUniV3Pool pool, address base,) = _twapSetup(76012);

        // Seed reserves => mark ~= 2000, within the default ±20% band of the index.
        vm.prank(alice);
        address mkt = twapFactory.createTwapMarket(address(pool), base, 1800, 1000e18, 2_000_000e18);
        assertEq(twapFactory.allMarketsLength(), 1);
        assertEq(PerpMarket(mkt).owner(), governor);
        assertApproxEqRel(PerpMarket(mkt).getIndexPrice(), 2000e18, 0.01e18, "index from TWAP");
        // G5: factory TWAP markets get the low (2x) leverage cap, not 50x.
        assertEq(PerpMarket(mkt).maxLeverage(), 2e18, "twap markets capped at 2x");
    }

    // ===== Guardrail tests =====

    // G1: a forged pool (not registered in the canonical factory) is rejected, even
    // though it implements observe()/token0/token1 — defeats the fake-oracle attack.
    function test_ForgedPoolRejected() public {
        (MarketFactory twapFactory,, address base, address quote) = _twapSetup(76012);
        // An attacker-controlled pool that the canonical factory never deployed.
        MockUniV3Pool fake = new MockUniV3Pool(base, quote, 999999); // arbitrary forged tick
        vm.prank(alice);
        vm.expectRevert(bytes("POOL_NOT_CANONICAL"));
        twapFactory.createTwapMarket(address(fake), base, 1800, 1000e18, 2_000_000e18);
    }

    // G3: pools below the liquidity floor are rejected.
    function test_ThinPoolRejected() public {
        (MarketFactory twapFactory, MockUniV3Pool pool, address base,) = _twapSetup(76012);
        vm.prank(governor);
        twapFactory.setTwapGuards(1e18, 2e18, 0, 0); // require >= 1e18 liquidity
        pool.setLiquidity(1e6); // dust
        vm.prank(alice);
        vm.expectRevert(bytes("POOL_TOO_THIN"));
        twapFactory.createTwapMarket(address(pool), base, 1800, 1000e18, 2_000_000e18);
    }

    // G9: seed reserves that put the mark far from the index are rejected.
    function test_MarkOutOfBandRejected() public {
        (MarketFactory twapFactory, MockUniV3Pool pool, address base,) = _twapSetup(76012);
        // index ~2000, but reserves imply mark ~200 (10x off) => out of ±20% band.
        vm.prank(alice);
        vm.expectRevert(bytes("MARK_OUT_OF_BAND"));
        twapFactory.createTwapMarket(address(pool), base, 1800, 10_000e18, 2_000_000e18);
    }

    // G6/G7: caps applied + creator-seeded isolated insurance pulled at launch.
    function test_CapsAndCreatorInsurance() public {
        (MarketFactory twapFactory, MockUniV3Pool pool, address base, address quote) = _twapSetup(76012);
        vm.startPrank(governor);
        twapFactory.setTwapGuards(0, 2e18, 100e18, 1_000e18); // caps: $100/wallet, $1k OI
        twapFactory.setLaunchEconomics(50e6, 0, 2000); // require 50 USDC insurance seed
        vm.stopPrank();

        MockERC20(quote).mint(alice, 100e6);
        vm.startPrank(alice);
        MockERC20(quote).approve(address(twapFactory), type(uint256).max);
        address mkt = twapFactory.createTwapMarket(address(pool), base, 1800, 1000e18, 2_000_000e18);
        vm.stopPrank();

        assertEq(PerpMarket(mkt).maxDepositPerWallet(), 100e18, "deposit cap set");
        assertEq(PerpMarket(mkt).maxOpenInterest(), 1_000e18, "OI cap set");
        // quote token is 18-dec here (collateralScale = 1), so 50e6 units -> 50e6 WAD.
        assertEq(PerpMarket(mkt).insuranceFund(), 50e6, "creator insurance seeded");
    }

    // G8: anti-spam launch fee is pulled from the creator and paid to the governor.
    function test_LaunchFeePaidToGovernor() public {
        (MarketFactory twapFactory, MockUniV3Pool pool, address base, address quote) = _twapSetup(76012);
        vm.prank(governor);
        twapFactory.setLaunchEconomics(0, 25e6, 2000); // 25 USDC fee

        MockERC20(quote).mint(alice, 25e6);
        vm.startPrank(alice);
        MockERC20(quote).approve(address(twapFactory), type(uint256).max);
        twapFactory.createTwapMarket(address(pool), base, 1800, 1000e18, 2_000_000e18);
        vm.stopPrank();

        assertEq(MockERC20(quote).balanceOf(governor), 25e6, "fee forwarded to governor");
    }

    function test_NoUniV3FactoryReverts() public {
        // factory (Pyth one) has univ3Factory unset; TWAP creation must fail closed.
        MockERC20 token = new MockERC20("Token A", "AAA", 18);
        address base = address(token);
        (address t0, address t1) = base < address(usdc) ? (base, address(usdc)) : (address(usdc), base);
        MockUniV3Pool pool = new MockUniV3Pool(t0, t1, 76012);
        vm.warp(2_000_000);
        vm.expectRevert(bytes("NO_UNIV3_FACTORY"));
        factory.createTwapMarket(address(pool), base, 1800, 1000e18, 2_000_000e18);
    }

    function test_DuplicatePythMarketReverts() public {
        factory.createPythMarket(ETH_USD, 1000e18, 2_000_000e18);
        vm.expectRevert(bytes("MARKET_EXISTS"));
        factory.createPythMarket(ETH_USD, 1000e18, 2_000_000e18);
    }

    function test_TwapWindowTooShortReverts() public {
        MockERC20 a = new MockERC20("Token A", "AAA", 18);
        (address base, address quote) =
            address(a) < address(usdc) ? (address(a), address(usdc)) : (address(usdc), address(a));
        MockUniV3Pool pool = new MockUniV3Pool(base, quote, 1000);
        vm.expectRevert(bytes("WINDOW_TOO_SHORT"));
        factory.createTwapMarket(address(pool), base, 60, 1000e18, 2_000_000e18);
    }

    function test_ReserveFloorEnforced() public {
        vm.expectRevert(bytes("RESERVES_TOO_SMALL"));
        factory.createPythMarket(ETH_USD, 0.5e18, 2_000_000e18); // below 1e18 floor
    }

    function test_OnlyGovernorCanSetDefaults() public {
        vm.prank(alice);
        vm.expectRevert(bytes("NOT_GOVERNOR"));
        factory.setRiskDefaults(20e18, 0.05e18, 0.01e18, 0.001e18);

        vm.prank(governor);
        factory.setRiskDefaults(20e18, 0.05e18, 0.01e18, 0.001e18);
        assertEq(factory.maxLeverage(), 20e18);
    }
}
