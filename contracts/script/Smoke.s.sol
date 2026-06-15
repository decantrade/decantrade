// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

/// @notice Local end-to-end smoke test against anvil: deploy mocks + an ETH market,
///         deposit, open a long, read mark price, then close — all on-chain.
contract Smoke is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);

        vm.startBroadcast(pk);

        MockERC20 usdc = new MockERC20("Decant Test USD", "tUSDC", 6);
        MockOracle oracle = new MockOracle(3000e18);
        PerpMarket market = new PerpMarket(IERC20(address(usdc)), IOracle(address(oracle)), 1000e18, 3_000_000e18);

        usdc.mint(me, 1_000_000e6);
        usdc.approve(address(market), type(uint256).max);

        console2.log("mark price (start):", market.getMarkPrice());

        market.deposit(100_000e6);
        market.openPosition(true, 10_000e18, 5e18); // 5x long, 50k notional
        console2.log("mark price (after long):", market.getMarkPrice());

        (int256 size, uint256 notional, uint256 margin,,) = market.positions(me);
        console2.log("position size (1e18):", size);
        console2.log("open notional:", notional);
        console2.log("margin:", margin);

        market.closePosition();
        console2.log("mark price (after close):", market.getMarkPrice());
        console2.log("free collateral after round trip:", market.freeCollateral(me));

        vm.stopBroadcast();
    }
}
