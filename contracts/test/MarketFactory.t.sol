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
        factory = new MarketFactory(IERC20(address(usdc)), IPyth(address(pyth)), governor);
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
        vm.warp(2_000_000); // ensure block.timestamp > TWAP window
        // Two 18-dec tokens; base is the lower address so base == token0.
        MockERC20 a = new MockERC20("Token A", "AAA", 18);
        MockERC20 b = new MockERC20("Token B", "BBB", 18);
        (address base, address quote) = address(a) < address(b) ? (address(a), address(b)) : (address(b), address(a));

        // tick 76012 => 1.0001^76012 ~= 2000 (USD per base, both 18 dec).
        MockUniV3Pool pool = new MockUniV3Pool(base, quote, 76012);

        UniswapV3TwapOracle oracle = new UniswapV3TwapOracle(address(pool), base, quote, 1800);
        assertApproxEqRel(oracle.getPrice(), 2000e18, 0.01e18, "TWAP ~ $2000");

        // Factory path (collateral must be the quote/USD token).
        MarketFactory twapFactory = new MarketFactory(IERC20(quote), IPyth(address(0)), governor);
        vm.prank(alice);
        address mkt = twapFactory.createTwapMarket(address(pool), base, 1800, 1000e18, 2_000_000e18);
        assertEq(twapFactory.allMarketsLength(), 1);
        assertEq(PerpMarket(mkt).owner(), governor);
        assertApproxEqRel(PerpMarket(mkt).getIndexPrice(), 2000e18, 0.01e18, "index from TWAP");
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
