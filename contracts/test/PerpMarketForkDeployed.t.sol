// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

/// @notice Fork test against the LIVE deployed Base mainnet ETH market to prove
///         the deployed bytecode is the oracle-priced (index-based) PnL code.
///         Etches a controllable oracle over the market's oracle address so we
///         can move the index without trades, then checks unrealizedPnl tracks
///         size * (index - entryPrice) on the real deployed contract.
///
/// Gated on BASE_FORK_RPC so the offline CI suite skips it. Run with:
///   BASE_FORK_RPC=https://mainnet.base.org \
///     forge test --match-contract PerpMarketForkDeployedTest -vv
contract PerpMarketForkDeployedTest is Test {
    address constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;
    // Index-based PnL redeploy (chain 8453).
    address constant ETH_MARKET = 0x2A984D3e130e1Ee50c7A16E9875F874665eF3e77;
    address constant ETH_ORACLE = 0x531346F4f474280920a565325cD4e7bB51171e84;
    address constant TRADER = 0xc1CdDE11b0ed6b5fd0c0805B6B829310bbC16825; // allowlisted

    uint256 constant WAD = 1e18;

    PerpMarket market;
    bool forked;

    function setUp() public {
        string memory rpc = vm.envOr("BASE_FORK_RPC", string(""));
        if (bytes(rpc).length == 0) return;
        vm.createSelectFork(rpc);
        forked = true;
        market = PerpMarket(ETH_MARKET);

        // Etch a settable oracle over the live oracle address so we can move the
        // index deterministically; seed it at $3,000.
        MockOracle mock = new MockOracle(3000e18);
        vm.etch(ETH_ORACLE, address(mock).code);
        MockOracle(ETH_ORACLE).setPrice(3000e18);
    }

    function test_Fork_DeployedMarketIsIndexPriced() public {
        if (!forked) {
            emit log("BASE_FORK_RPC unset - skipping deployed-market fork test");
            return;
        }

        // Fund the allowlisted trader with real USDC on the fork.
        deal(USDC, TRADER, 1_000e6, true);
        vm.startPrank(TRADER);
        IERC20(USDC).approve(ETH_MARKET, type(uint256).max);
        market.deposit(200e6); // $200 (per-wallet deposit cap)
        market.openPosition(true, 100e18, 5e18); // $100 margin, 5x -> $500 long @ 3000
        vm.stopPrank();

        (int256 size,,,, uint256 entryPrice) = market.positions(TRADER);
        assertEq(entryPrice, 3000e18, "entry snapped to oracle (index-based struct)");
        assertApproxEqAbs(market.unrealizedPnl(TRADER), int256(0), 1e15, "flat pnl at open");

        uint256 markBefore = market.getMarkPrice();

        // Index +10% with no trades: vAMM mark stays flat, PnL must track oracle.
        MockOracle(ETH_ORACLE).setPrice(3300e18);
        assertEq(market.getMarkPrice(), markBefore, "mark flat without flow");

        int256 expected = (size * int256(300e18)) / int256(WAD);
        assertGt(market.unrealizedPnl(TRADER), int256(0), "profit despite flat mark");
        assertApproxEqAbs(market.unrealizedPnl(TRADER), expected, 1e15, "pnl == size * index delta");

        // Round trip realizes the oracle delta.
        uint256 freeBefore = market.freeCollateral(TRADER);
        vm.prank(TRADER);
        market.closePosition();
        uint256 gained = market.freeCollateral(TRADER) - freeBefore;
        assertGt(gained, 140e18, "margin + ~$50 profit realized");
        (int256 sizeAfter,,,,) = market.positions(TRADER);
        assertEq(sizeAfter, int256(0), "position closed");
    }
}
