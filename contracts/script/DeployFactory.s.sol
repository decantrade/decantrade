// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {IPyth} from "../src/oracle/PythOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @notice Deploys the permissionless MarketFactory to Base Sepolia and creates a
///         SOL/USD market through it to demonstrate permissionless listing.
///
/// Env:
///   PRIVATE_KEY  - deployer (= initial governor)
///   USDC         - collateral token (defaults to the MVP test USDC)
///   PYTH         - Pyth contract (defaults to Base Sepolia)
///   UNIV3_FACTORY- canonical Uniswap V3 factory (defaults to Base Sepolia)
contract DeployFactory is Script {
    bytes32 constant SOL_USD = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        address usdc = vm.envOr("USDC", address(0xD556750FCeD5C6BfB867fb3cDc4F0F709c23adEf));
        address pythAddr = vm.envOr("PYTH", address(0xA2aa501b19aff244D90cc15a4Cf739D2725B5729));
        // Canonical Uniswap V3 factory — Base Sepolia by default; pass Base mainnet
        // (0x33128a8fC17869897dcE68Ed026d694621f6FDfD) via UNIV3_FACTORY for mainnet.
        address univ3 = vm.envOr("UNIV3_FACTORY", address(0x4752ba5DBc23f44D87826276BF6Fd6b1C372aD24));

        uint256 solPrice = _price(IPyth(pythAddr), SOL_USD);

        vm.startBroadcast(pk);
        MarketFactory factory = new MarketFactory(IERC20(usdc), IPyth(pythAddr), me, univ3);
        uint256 base = 10_000e18;
        address solMarket = factory.createPythMarket(SOL_USD, base, base * solPrice / 1e18);
        vm.stopBroadcast();

        console2.log("MarketFactory:", address(factory));
        console2.log("SOL market:   ", solMarket);
        console2.log("SOL seed px:  ", solPrice);
        console2.log("markets count:", factory.allMarketsLength());
    }

    function _price(IPyth pyth, bytes32 id) internal view returns (uint256) {
        IPyth.Price memory p = pyth.getPriceUnsafe(id);
        require(p.price > 0, "BAD_SEED_PRICE");
        uint256 raw = uint256(uint64(p.price));
        int256 targetExpo = int256(18) + int256(p.expo);
        if (targetExpo >= 0) return raw * (10 ** uint256(targetExpo));
        return raw / (10 ** uint256(-targetExpo));
    }
}
