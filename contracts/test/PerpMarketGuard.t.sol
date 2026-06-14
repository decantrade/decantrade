// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

/// Tests for the guarded-launch controls: holder gate, allowlist, deposit cap,
/// open-interest cap, and pause. Defaults stay disabled (covered by PerpMarket.t.sol).
contract PerpMarketGuardTest is Test {
    MockERC20 usdc;
    MockERC20 decant; // gate token
    MockOracle oracle;
    PerpMarket market;

    address owner = address(this);
    address holder = address(0xA11CE);
    address poor = address(0xBEEF);

    uint256 constant WAD = 1e18;
    uint256 constant BASE_RESERVE = 1000e18;
    uint256 constant QUOTE_RESERVE = 3_000_000e18;

    function setUp() public {
        usdc = new MockERC20("USD Coin", "USDC", 6);
        decant = new MockERC20("Decant", "DECANT", 18);
        oracle = new MockOracle(3000e18);
        market = new PerpMarket(IERC20(address(usdc)), IOracle(address(oracle)), BASE_RESERVE, QUOTE_RESERVE);

        _fund(holder, 1_000_000e6);
        _fund(poor, 1_000_000e6);
    }

    function _fund(address who, uint256 amt6) internal {
        usdc.mint(who, amt6);
        vm.prank(who);
        usdc.approve(address(market), type(uint256).max);
    }

    // ---------------------------------------------------------
    // Holder gate
    // ---------------------------------------------------------

    function test_GateBlocksNonHolders() public {
        market.setGate(IERC20(address(decant)), 100e18);
        decant.mint(holder, 100e18); // exactly the threshold

        vm.prank(poor);
        vm.expectRevert(bytes("NOT_GATED"));
        market.deposit(1_000e6);

        vm.prank(holder);
        market.deposit(1_000e6); // holder passes
        assertEq(market.freeCollateral(holder), 1_000e18);
    }

    function test_AllowlistOverridesGate() public {
        market.setGate(IERC20(address(decant)), 100e18);
        market.setAllowlist(poor, true);

        vm.prank(poor);
        market.deposit(1_000e6); // allowlisted despite zero DECANT
        assertEq(market.freeCollateral(poor), 1_000e18);
    }

    function test_DisablingGateReopensAccess() public {
        market.setGate(IERC20(address(decant)), 100e18);
        market.setGate(IERC20(address(0)), 0); // disable

        vm.prank(poor);
        market.deposit(1_000e6);
        assertEq(market.freeCollateral(poor), 1_000e18);
    }

    // ---------------------------------------------------------
    // Deposit cap
    // ---------------------------------------------------------

    function test_DepositCapEnforcedAndFreedByWithdraw() public {
        market.setCaps(1_000e18, 0); // $1000 per wallet

        vm.prank(holder);
        market.deposit(1_000e6); // hits cap exactly

        vm.prank(holder);
        vm.expectRevert(bytes("DEPOSIT_CAP"));
        market.deposit(1e6);

        // Withdrawing frees headroom.
        vm.prank(holder);
        market.withdraw(400e6);
        vm.prank(holder);
        market.deposit(400e6); // now fits again
        assertEq(market.freeCollateral(holder), 1_000e18);
    }

    // ---------------------------------------------------------
    // Open-interest cap
    // ---------------------------------------------------------

    function test_OpenInterestCapEnforced() public {
        market.setCaps(0, 5_000e18); // $5000 aggregate OI
        vm.prank(holder);
        market.deposit(100_000e6);

        // 10x on $600 margin = $6000 notional > cap.
        vm.prank(holder);
        vm.expectRevert(bytes("OI_CAP"));
        market.openPosition(true, 600e18, 10e18);

        // $400 margin * 10x = $4000 notional fits.
        vm.prank(holder);
        market.openPosition(true, 400e18, 10e18);
        assertEq(market.totalOpenInterest(), 4_000e18, "OI tracked");

        // Closing releases the OI.
        vm.prank(holder);
        market.closePosition();
        assertEq(market.totalOpenInterest(), 0, "OI released");
    }

    // ---------------------------------------------------------
    // Pause
    // ---------------------------------------------------------

    function test_PauseBlocksDepositAndOpenButNotCloseOrWithdraw() public {
        vm.prank(holder);
        market.deposit(10_000e6);
        vm.prank(holder);
        market.openPosition(true, 1_000e18, 5e18);

        market.setPaused(true);

        vm.prank(holder);
        vm.expectRevert(bytes("PAUSED"));
        market.deposit(1_000e6);

        // Close and withdraw must still work while paused (never trap funds).
        vm.prank(holder);
        market.closePosition();
        vm.prank(holder);
        market.withdraw(1_000e6);
    }

    // ---------------------------------------------------------
    // Access control
    // ---------------------------------------------------------

    function test_OnlyOwnerCanSetGuards() public {
        vm.startPrank(poor);
        vm.expectRevert(bytes("NOT_OWNER"));
        market.setPaused(true);
        vm.expectRevert(bytes("NOT_OWNER"));
        market.setGate(IERC20(address(decant)), 1);
        vm.expectRevert(bytes("NOT_OWNER"));
        market.setCaps(1, 1);
        vm.expectRevert(bytes("NOT_OWNER"));
        market.setAllowlist(poor, true);
        vm.stopPrank();
    }
}
