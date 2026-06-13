// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {MockOracle} from "../src/mocks/MockOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

/// @notice Deploys a pre-IPO SPCX (SpaceX) perp market to Base Sepolia.
///
/// SpaceX is a private company with no Pyth/Uniswap on-chain price feed, so this
/// market uses a settable MockOracle for the index price (keeper-pushed on
/// testnet). The vAMM is seeded so mark ≈ index at launch.
///
/// Env:
///   PRIVATE_KEY  - deployer key (must hold Base Sepolia ETH)
///   USDC         - collateral token (Decant tUSDC on Base Sepolia)
///   SPCX_PRICE   - seed price (1e18 USD/share); default 158.41e18
contract DeploySpcx is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address usdcAddr = vm.envOr("USDC", address(0xD556750FCeD5C6BfB867fb3cDc4F0F709c23adEf));
        uint256 seedPrice = vm.envOr("SPCX_PRICE", uint256(158_41e16)); // 158.41 * 1e18

        vm.startBroadcast(pk);

        MockOracle oracle = new MockOracle(seedPrice);

        // base depth 5000 shares → quote = base * price (≈ $792k virtual depth)
        uint256 base = 5000e18;
        uint256 quote = base * seedPrice / 1e18;
        PerpMarket market = new PerpMarket(IERC20(usdcAddr), IOracle(address(oracle)), base, quote);

        vm.stopBroadcast();

        console2.log("SPCX oracle: ", address(oracle));
        console2.log("SPCX market: ", address(market));
        console2.log("SPCX seed px:", seedPrice);
    }
}
