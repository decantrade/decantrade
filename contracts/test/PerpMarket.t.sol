// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

contract PerpMarketTest is Test {
    MockERC20 usdc;
    MockOracle oracle;
    PerpMarket market;

    address alice = address(0xA11CE);
    address bob = address(0xB0B);
    address keeper = address(0xCAFE);

    uint256 constant WAD = 1e18;

    // ETH/USD market @ ~$3000: 1000 ETH virtual base, $3,000,000 virtual quote.
    uint256 constant BASE_RESERVE = 1000e18;
    uint256 constant QUOTE_RESERVE = 3_000_000e18;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        oracle = new MockOracle(3000e18);
        market = new PerpMarket(IERC20(address(usdc)), IOracle(address(oracle)), BASE_RESERVE, QUOTE_RESERVE);

        _fund(alice, 1_000_000e6);
        _fund(bob, 5_000_000e6);
        _fund(keeper, 1_000e6);
    }

    function _fund(address who, uint256 amt6) internal {
        usdc.mint(who, amt6);
        vm.prank(who);
        usdc.approve(address(market), type(uint256).max);
    }

    function _deposit(address who, uint256 amt6) internal {
        vm.prank(who);
        market.deposit(amt6);
    }

    // ---------------------------------------------------------
    // Collateral
    // ---------------------------------------------------------

    function test_DepositAndWithdraw() public {
        _deposit(alice, 100_000e6);
        assertEq(market.freeCollateral(alice), 100_000e18, "free after deposit");

        vm.prank(alice);
        market.withdraw(40_000e6);
        assertEq(market.freeCollateral(alice), 60_000e18, "free after withdraw");
        assertEq(usdc.balanceOf(alice), 1_000_000e6 - 100_000e6 + 40_000e6, "token balance");
    }

    function test_WithdrawTooMuchReverts() public {
        _deposit(alice, 10_000e6);
        vm.prank(alice);
        vm.expectRevert(bytes("INSUFFICIENT"));
        market.withdraw(20_000e6);
    }

    // ---------------------------------------------------------
    // Opening positions
    // ---------------------------------------------------------

    function test_OpenLongMovesMarkPriceUp() public {
        _deposit(alice, 100_000e6);
        uint256 markBefore = market.getMarkPrice();

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18); // 50k notional long

        (int256 size, uint256 openNotional, uint256 margin,,) = market.positions(alice);
        assertGt(size, 0, "long size positive");
        assertEq(openNotional, 50_000e18, "notional");
        assertEq(margin, 10_000e18 - 50e18, "margin net of 0.1% fee");
        assertGt(market.getMarkPrice(), markBefore, "mark up after long");
        assertEq(market.freeCollateral(alice), 90_000e18, "margin locked");
    }

    function test_OpenShortMovesMarkPriceDown() public {
        _deposit(alice, 100_000e6);
        uint256 markBefore = market.getMarkPrice();

        vm.prank(alice);
        market.openPosition(false, 10_000e18, 5e18);

        (int256 size,,,,) = market.positions(alice);
        assertLt(size, 0, "short size negative");
        assertLt(market.getMarkPrice(), markBefore, "mark down after short");
    }

    function test_OpenRevertsOnBadLeverageAndDoublePosition() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        vm.expectRevert(bytes("BAD_LEVERAGE"));
        market.openPosition(true, 10_000e18, 51e18); // > maxLeverage (50x)

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18);

        vm.prank(alice);
        vm.expectRevert(bytes("POSITION_EXISTS"));
        market.openPosition(true, 10_000e18, 2e18);
    }

    // ---------------------------------------------------------
    // PnL
    // ---------------------------------------------------------

    function test_LongProfitsWhenPriceRises() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18); // alice long @ 3000

        assertApproxEqAbs(market.unrealizedPnl(alice), int256(0), 1e18, "pnl ~0 right after open");

        // Oracle/index price rises 10% -> long profits (oracle-priced PnL).
        oracle.setPrice(3300e18);

        assertGt(market.unrealizedPnl(alice), int256(0), "alice long in profit after price up");

        uint256 freeBefore = market.freeCollateral(alice);
        vm.prank(alice);
        market.closePosition();
        assertGt(market.freeCollateral(alice), freeBefore + 10_000e18, "profit realized to free collateral");
    }

    function test_ShortProfitsWhenPriceFalls() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        market.openPosition(false, 10_000e18, 5e18); // alice short @ 3000

        // Oracle/index price falls 10% -> short profits.
        oracle.setPrice(2700e18);

        assertGt(market.unrealizedPnl(alice), int256(0), "alice short in profit after price down");
    }

    /// @notice PnL must follow the oracle index even when the vAMM mark is flat
    ///         (no other trades). This is the scenario that previously showed
    ///         ~$0 PnL despite the real price moving.
    function test_PnlTracksOracleNotMark() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18); // long @ 3000

        uint256 markBefore = market.getMarkPrice();

        // Index rises 10% but nobody trades, so the vAMM mark is unchanged.
        oracle.setPrice(3300e18);
        assertEq(market.getMarkPrice(), markBefore, "mark unchanged without flow");

        // PnL still reflects the index move: size * (3300 - 3000).
        (int256 size,,,,) = market.positions(alice);
        int256 expected = (size * int256(300e18)) / int256(WAD);
        int256 pnl = market.unrealizedPnl(alice);
        assertGt(pnl, int256(0), "profit despite a flat mark");
        assertApproxEqAbs(pnl, expected, 1e15, "pnl == size * index delta");
    }

    function test_RoundTripWithNoMoveCostsOnlyFees() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18);

        vm.prank(alice);
        market.closePosition();

        // Started with 100k free; pays ~open fee (50) + close fee (~50) in slippage/fees.
        uint256 free = market.freeCollateral(alice);
        assertLt(free, 100_000e18, "round trip costs something");
        assertGt(free, 99_800e18, "but only a small amount (fees)");
    }

    // ---------------------------------------------------------
    // Partial close
    // ---------------------------------------------------------

    function test_PartialCloseHalvesPosition() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18); // 50k notional, margin 9,950
        (int256 size0,, uint256 margin0,,) = market.positions(alice);
        uint256 freeAfterOpen = market.freeCollateral(alice);

        vm.prank(alice);
        market.closePartial(0.5e18);

        (int256 size1, uint256 notional1, uint256 margin1,,) = market.positions(alice);
        assertApproxEqAbs(size1, size0 / 2, 2, "size halved");
        assertEq(notional1, 25_000e18, "notional halved");
        assertEq(margin1, margin0 / 2, "margin halved");
        // About half the margin is released. The amount isn't exactly half:
        // closing the first slice realizes a small vAMM convexity profit and
        // pays a close fee, so allow a wider band around margin0 / 2.
        uint256 released = market.freeCollateral(alice) - freeAfterOpen;
        assertApproxEqAbs(released, margin0 / 2, 400e18, "about half margin released");
    }

    function test_PartialCloseRealizesProfit() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18);

        // Index rises -> position in profit.
        oracle.setPrice(3300e18);

        uint256 freeBefore = market.freeCollateral(alice);
        (int256 size0,,,,) = market.positions(alice);

        vm.prank(alice);
        market.closePartial(0.5e18);

        assertGt(market.freeCollateral(alice), freeBefore, "profit + margin realized on the closed half");
        (int256 size1,,,,) = market.positions(alice);
        assertApproxEqAbs(size1, size0 / 2, 2, "half the position remains");
        assertGt(market.unrealizedPnl(alice), int256(0), "remaining half still in profit");
    }

    function test_PartialCloseFullRoutesToClose() public {
        _deposit(alice, 100_000e6);
        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18);

        vm.prank(alice);
        market.closePartial(1e18);
        (int256 size,,,,) = market.positions(alice);
        assertEq(size, int256(0), "full close clears position");
    }

    function test_PartialCloseRevertsBadFraction() public {
        _deposit(alice, 100_000e6);
        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18);

        vm.prank(alice);
        vm.expectRevert(bytes("BAD_FRACTION"));
        market.closePartial(0);

        vm.prank(alice);
        vm.expectRevert(bytes("BAD_FRACTION"));
        market.closePartial(1e18 + 1);
    }

    // ---------------------------------------------------------
    // Adjust margin
    // ---------------------------------------------------------

    function test_AddMarginRaisesMarginAndLowersRisk() public {
        _deposit(alice, 100_000e6);
        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18);

        (,, uint256 margin0,,) = market.positions(alice);
        int256 ratio0 = market.marginRatio(alice);
        uint256 free0 = market.freeCollateral(alice);

        vm.prank(alice);
        market.addMargin(5_000e18);

        (,, uint256 margin1,,) = market.positions(alice);
        assertEq(margin1, margin0 + 5_000e18, "margin increased");
        assertEq(market.freeCollateral(alice), free0 - 5_000e18, "free collateral debited");
        assertGt(market.marginRatio(alice), ratio0, "margin ratio improved");
    }

    function test_RemoveMarginReturnsCollateral() public {
        _deposit(alice, 100_000e6);
        vm.prank(alice);
        market.openPosition(true, 10_000e18, 2e18); // low leverage -> headroom to remove

        (,, uint256 margin0,,) = market.positions(alice);
        uint256 free0 = market.freeCollateral(alice);

        vm.prank(alice);
        market.removeMargin(3_000e18);

        (,, uint256 margin1,,) = market.positions(alice);
        assertEq(margin1, margin0 - 3_000e18, "margin reduced");
        assertEq(market.freeCollateral(alice), free0 + 3_000e18, "collateral returned to free");
    }

    function test_RemoveMarginRevertsWhenExceedingMaxLeverage() public {
        _deposit(alice, 100_000e6);
        vm.prank(alice);
        market.openPosition(true, 10_000e18, 2e18); // 20k notional

        // Removing almost all margin would push 20k notional past 50x.
        vm.prank(alice);
        vm.expectRevert(bytes("EXCEEDS_MAX_LEVERAGE"));
        market.removeMargin(9_700e18);
    }

    // ---------------------------------------------------------
    // Funding
    // ---------------------------------------------------------

    function test_FundingLongsPayWhenMarkAboveIndex() public {
        _deposit(alice, 100_000e6);

        vm.prank(alice);
        market.openPosition(true, 10_000e18, 5e18); // long, mark now > index (3000)

        // Index stays at 3000, mark is above -> premium positive -> longs pay.
        int256 avBefore = market.accountValue(alice);

        vm.warp(block.timestamp + 1 hours);
        market.settleFunding();

        assertGt(market.cumulativePremiumFraction(), int256(0), "positive premium (mark>index)");
        assertLt(market.accountValue(alice), avBefore, "long pays funding");
    }

    // ---------------------------------------------------------
    // Liquidation
    // ---------------------------------------------------------

    function test_LiquidationFlow() public {
        // Use a wider maintenance window for a cleanly-tuned liquidation scenario.
        market.setRiskParams(10e18, 0.0625e18, 0.0125e18, 0.001e18);
        _deposit(alice, 100_000e6);

        // Alice opens a 10x long -> thin margin buffer.
        vm.prank(alice);
        market.openPosition(true, 20_000e18, 10e18); // 200k notional @ 3000

        // Not liquidatable yet.
        vm.prank(keeper);
        vm.expectRevert(bytes("NOT_LIQUIDATABLE"));
        market.liquidate(alice);

        // Index drops enough to put Alice's 10x long under maintenance margin,
        // but not so far that she's in bad debt (so a reward remains).
        oracle.setPrice(2800e18);

        assertLt(market.marginRatio(alice), int256(market.maintenanceMarginRatio()), "under maintenance");

        uint256 keeperFreeBefore = market.freeCollateral(keeper);
        vm.prank(keeper);
        market.liquidate(alice);

        (int256 size,,,,) = market.positions(alice);
        assertEq(size, int256(0), "position cleared");
        assertGt(market.freeCollateral(keeper), keeperFreeBefore, "keeper earned a reward");
    }
}
