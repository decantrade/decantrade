// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {PythOracle, IPyth} from "../src/oracle/PythOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

/// @notice Adds BTC/USD + SOL/USD guarded markets to the Base mainnet beta,
///         mirroring the ETH/USD launch (holder gate + caps + reduced leverage).
///         UNAUDITED — keep caps small. See DeployBaseMainnetGuarded.s.sol.
///
/// Verified Base mainnet addresses (checked on-chain this session):
///   USDC   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  (6 dec)
///   Pyth   0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a  (BTC/USD + SOL/USD live)
///   DECANT 0x10feE05Ef916625FD86b2fED432e325bE897BBa3  (18 dec)
///
/// Env:
///   PRIVATE_KEY   deployer key (must hold Base mainnet ETH for gas)
///   GATE_MIN      min $DECANT (18-dec wei) a wallet must hold to trade  [required, > 0]
///   MAX_DEPOSIT   per-wallet deposit cap, USD WAD (default 200e18 = $200)
///   MAX_OI        global open-interest cap, USD WAD (default 2000e18 = $2,000)
///   MAX_LEV       max leverage, WAD (default 10e18 = 10x)
///   ALLOWLIST     optional address to allowlist on both markets (0 = skip)
///   FINAL_OWNER   address to transfer ownership to after setup (0 = keep deployer)
///   PYTH/USDC/GATE_TOKEN  override defaults if needed
///
/// Run:
///   forge script script/DeployBaseMainnetBtcSol.s.sol \
///     --rpc-url https://base-rpc.publicnode.com --broadcast
contract DeployBaseMainnetBtcSol is Script {
    bytes32 constant BTC_USD = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant SOL_USD = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    uint256 constant MAX_AGE = 3600; // lenient: don't brick trading if a Pyth push lapses

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address pythAddr = vm.envOr("PYTH", address(0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a));
        address usdcAddr = vm.envOr("USDC", address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913));
        address gateToken = vm.envOr("GATE_TOKEN", address(0x10feE05Ef916625FD86b2fED432e325bE897BBa3));

        uint256 gateMin = vm.envUint("GATE_MIN");
        require(gateMin > 0, "SET_GATE_MIN");
        uint256 maxDeposit = vm.envOr("MAX_DEPOSIT", uint256(200e18));
        uint256 maxOi = vm.envOr("MAX_OI", uint256(2000e18));
        uint256 maxLev = vm.envOr("MAX_LEV", uint256(10e18));
        address allowlist = vm.envOr("ALLOWLIST", address(0));
        address finalOwner = vm.envOr("FINAL_OWNER", address(0));

        vm.startBroadcast(pk);

        address btcMarket = _deployMarket(
            pythAddr, BTC_USD, usdcAddr, gateToken, gateMin, maxDeposit, maxOi, maxLev, allowlist, finalOwner
        );
        address solMarket = _deployMarket(
            pythAddr, SOL_USD, usdcAddr, gateToken, gateMin, maxDeposit, maxOi, maxLev, allowlist, finalOwner
        );

        vm.stopBroadcast();

        console2.log("=== Decant guarded mainnet (BTC + SOL) ===");
        console2.log("USDC:        ", usdcAddr);
        console2.log("Pyth:        ", pythAddr);
        console2.log("BTC market:  ", btcMarket);
        console2.log("SOL market:  ", solMarket);
        console2.log("Gate token:  ", gateToken);
        console2.log("Gate min:    ", gateMin);
        console2.log("Max deposit: ", maxDeposit);
        console2.log("Max OI:      ", maxOi);
        console2.log("Max leverage:", maxLev);
        console2.log("Allowlisted: ", allowlist);
        console2.log("Owner:       ", finalOwner == address(0) ? "deployer (transfer later)" : "transferred");
    }

    function _deployMarket(
        address pythAddr,
        bytes32 feed,
        address usdcAddr,
        address gateToken,
        uint256 gateMin,
        uint256 maxDeposit,
        uint256 maxOi,
        uint256 maxLev,
        address allowlist,
        address finalOwner
    ) internal returns (address) {
        PythOracle oracle = new PythOracle(IPyth(pythAddr), feed, MAX_AGE);

        // Seed vAMM at the live Pyth price so mark ≈ index at launch.
        uint256 price = _price(IPyth(pythAddr), feed);
        uint256 baseReserve = 1000e18;
        PerpMarket market =
            new PerpMarket(IERC20(usdcAddr), IOracle(address(oracle)), baseReserve, baseReserve * price / 1e18);

        market.setRiskParams(maxLev, 0.01e18, 0.005e18, 0.001e18);
        market.setGate(IERC20(gateToken), gateMin);
        market.setCaps(maxDeposit, maxOi);
        if (allowlist != address(0)) {
            market.setAllowlist(allowlist, true);
        }
        if (finalOwner != address(0)) {
            market.transferOwnership(finalOwner);
        }
        return address(market);
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
