// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {PythOracle, IPyth} from "../src/oracle/PythOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

/// @notice Guarded mainnet launch: deploys ONE ETH/USD market on Base mainnet
///         with holder gate + caps + reduced leverage, then (optionally) hands
///         ownership to a safe address. UNAUDITED — keep caps small.
///
/// Verified Base mainnet addresses (checked on-chain this session):
///   USDC   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  (6 dec)
///   Pyth   0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a  (ETH/USD live)
///   DECANT 0x10feE05Ef916625FD86b2fED432e325bE897BBa3  (18 dec)
///
/// Env:
///   PRIVATE_KEY   deployer key (must hold Base mainnet ETH for gas)
///   GATE_MIN      min $DECANT (18-dec wei) a wallet must hold to trade  [required, > 0]
///   MAX_DEPOSIT   per-wallet deposit cap, USD WAD (default 100e18 = $100)
///   MAX_OI        global open-interest cap, USD WAD (default 2000e18 = $2,000)
///   MAX_LEV       max leverage, WAD (default 5e18 = 5x)
///   FINAL_OWNER   address to transfer ownership to after setup (0 = keep deployer)
///   PYTH/USDC/GATE_TOKEN  override defaults if needed
///
/// Run:
///   forge script script/DeployBaseMainnetGuarded.s.sol \
///     --rpc-url https://mainnet.base.org --broadcast
contract DeployBaseMainnetGuarded is Script {
    bytes32 constant ETH_USD = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    uint256 constant MAX_AGE = 3600; // lenient: don't brick trading if a Pyth push lapses

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address pythAddr = vm.envOr("PYTH", address(0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a));
        address usdcAddr = vm.envOr("USDC", address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913));
        address gateToken = vm.envOr("GATE_TOKEN", address(0x10feE05Ef916625FD86b2fED432e325bE897BBa3));

        uint256 gateMin = vm.envUint("GATE_MIN");
        require(gateMin > 0, "SET_GATE_MIN");
        uint256 maxDeposit = vm.envOr("MAX_DEPOSIT", uint256(100e18));
        uint256 maxOi = vm.envOr("MAX_OI", uint256(2000e18));
        uint256 maxLev = vm.envOr("MAX_LEV", uint256(5e18));
        address finalOwner = vm.envOr("FINAL_OWNER", address(0));

        vm.startBroadcast(pk);

        PythOracle ethOracle = new PythOracle(IPyth(pythAddr), ETH_USD, MAX_AGE);

        // Seed vAMM at the live Pyth price so mark ≈ index at launch.
        uint256 ethPrice = _price(IPyth(pythAddr), ETH_USD);
        uint256 ethBase = 1000e18;
        PerpMarket market =
            new PerpMarket(IERC20(usdcAddr), IOracle(address(ethOracle)), ethBase, ethBase * ethPrice / 1e18);

        // Guarded-launch config.
        market.setRiskParams(maxLev, 0.01e18, 0.005e18, 0.001e18);
        market.setGate(IERC20(gateToken), gateMin);
        market.setCaps(maxDeposit, maxOi);

        if (finalOwner != address(0)) {
            market.transferOwnership(finalOwner);
        }

        vm.stopBroadcast();

        console2.log("=== Decant guarded mainnet (ETH/USD) ===");
        console2.log("USDC:        ", usdcAddr);
        console2.log("Pyth:        ", pythAddr);
        console2.log("ETH oracle:  ", address(ethOracle));
        console2.log("ETH market:  ", address(market));
        console2.log("Seed price:  ", ethPrice);
        console2.log("Gate token:  ", gateToken);
        console2.log("Gate min:    ", gateMin);
        console2.log("Max deposit: ", maxDeposit);
        console2.log("Max OI:      ", maxOi);
        console2.log("Max leverage:", maxLev);
        console2.log("Owner:       ", finalOwner == address(0) ? "deployer (transfer later)" : "transferred");
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
