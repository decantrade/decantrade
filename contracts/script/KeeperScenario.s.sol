// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";

/// @notice Sets up a liquidatable position on a local anvil for the keeper-bot demo.
///         Deploys a fresh ETH/USD market, opens a 10x long for `victim`, then crashes
///         the mark price with a large opposing short so the long falls below the
///         maintenance margin and becomes liquidatable. Prints the market address.
///
/// Signing keys are read from the environment so none are committed. For the
/// local anvil demo, export the anvil default accounts (anvil prints them on
/// startup), e.g.:
///   export DEPLOYER_PK=0x... VICTIM_PK=0x... WHALE_PK=0x...
contract KeeperScenario is Script {
    uint256 constant BASE_RESERVE = 1000e18; // 1000 ETH
    uint256 constant QUOTE_RESERVE = 3_000_000e18; // $3,000,000 → mark $3000

    function run() external {
        uint256 deployerPk = vm.envUint("DEPLOYER_PK");
        uint256 victimPk = vm.envUint("VICTIM_PK");
        uint256 whalePk = vm.envUint("WHALE_PK");

        address victim = vm.addr(victimPk);
        address whale = vm.addr(whalePk);

        // --- deploy + fund (deployer) ---
        vm.startBroadcast(deployerPk);
        MockERC20 usdc = new MockERC20("USD Coin", "USDC", 6);
        MockOracle oracle = new MockOracle(3000e18);
        PerpMarket market = new PerpMarket(IERC20(address(usdc)), IOracle(address(oracle)), BASE_RESERVE, QUOTE_RESERVE);
        usdc.mint(victim, 100_000e6);
        usdc.mint(whale, 5_000_000e6);
        vm.stopBroadcast();

        // --- victim: deposit + 10x long $10k notional ---
        vm.startBroadcast(victimPk);
        usdc.approve(address(market), type(uint256).max);
        market.deposit(1_000e6); // $1,000 collateral
        market.openPosition(true, 1_000e18, 10e18); // long, margin $1k, 10x → $10k notional
        vm.stopBroadcast();

        // --- whale: crash the mark price with a large short ---
        vm.startBroadcast(whalePk);
        usdc.approve(address(market), type(uint256).max);
        market.deposit(100_000e6);
        market.openPosition(false, 8_000e18, 10e18); // short, $80k notional → mild crash, victim left with residual value
        vm.stopBroadcast();

        int256 ratio = market.marginRatio(victim);
        console2.log("MARKET_ADDRESS", address(market));
        console2.log("USDC_ADDRESS", address(usdc));
        console2.log("VICTIM", victim);
        console2.log("mark price (1e18)", market.getMarkPrice());
        console2.log("victim marginRatio (1e18, signed)", ratio);
        console2.log("maintenance (1e18)", market.maintenanceMarginRatio());
    }
}
