// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

/// @notice Fork test against live Base mainnet. Deploys a fresh PerpMarket with
///         the new oracle-priced PnL code, funded with real USDC, and proves a
///         round trip pays out PnL == size * index delta.
///
/// Gated on the BASE_FORK_RPC env var so the offline CI suite skips it. Run with:
///   BASE_FORK_RPC=https://mainnet.base.org forge test --match-contract PerpMarketForkBaseTest -vv
contract PerpMarketForkBaseTest is Test {
    // Native USDC on Base mainnet (6 decimals).
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    uint256 constant WAD = 1e18;
    uint256 constant BASE_RESERVE = 1000e18; // ~$3000 ETH market
    uint256 constant QUOTE_RESERVE = 3_000_000e18;

    PerpMarket market;
    MockOracle oracle;
    address trader = address(0x7AD3);

    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;

        oracle = new MockOracle(3000e18);
        market = new PerpMarket(IERC20(USDC), IOracle(address(oracle)), BASE_RESERVE, QUOTE_RESERVE);

        // Give the trader 1,000 real USDC on the fork and approve the market.
        deal(USDC, trader, 1_000e6, true);
        vm.prank(trader);
        IERC20(USDC).approve(address(market), type(uint256).max);
    }

    function test_Fork_RoundTripPaysOraclePnl() public {
        if (!forked) {
            emit log("BASE_FORK_RPC unset - skipping Base mainnet fork test");
            return;
        }

        vm.startPrank(trader);
        market.deposit(1_000e6); // 1,000 USDC -> 1,000e18 free collateral
        market.openPosition(true, 200e18, 5e18); // $200 margin, 5x -> $1,000 notional long @ 3000
        vm.stopPrank();

        (int256 size,,,, uint256 entryPrice) = market.positions(trader);
        assertEq(entryPrice, 3000e18, "entry snapped to oracle");
        assertApproxEqAbs(market.unrealizedPnl(trader), int256(0), 1e15, "flat pnl at open");

        uint256 markBefore = market.getMarkPrice();

        // Index rises 10% with no further trades: the vAMM mark stays flat,
        // but PnL must track the oracle.
        oracle.setPrice(3300e18);
        assertEq(market.getMarkPrice(), markBefore, "mark flat without flow");

        int256 expected = (size * int256(300e18)) / int256(WAD); // size * (3300 - 3000)
        assertApproxEqAbs(market.unrealizedPnl(trader), expected, 1e15, "pnl == size * index delta");

        uint256 freeBefore = market.freeCollateral(trader);
        vm.prank(trader);
        market.closePosition();

        // Realized: margin (~199.8) + ~10% of $1,000 notional - close fee.
        uint256 gained = market.freeCollateral(trader) - freeBefore;
        assertGt(gained, 290e18, "margin + ~$100 profit realized");
        (int256 sizeAfter,,,,) = market.positions(trader);
        assertEq(sizeAfter, int256(0), "position closed");
    }
}
