// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {PythOracle, IPyth} from "../src/oracle/PythOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

/// @notice Redeploys the guarded ETH/BTC/SOL beta markets on Base mainnet using
///         the oracle-priced (index-based) PnL PerpMarket. Mirrors the previous
///         launch config exactly: 50M $DECANT gate, $200/wallet, $2k OI, 10x,
///         test wallet allowlisted, owner kept at the deployer. UNAUDITED.
///
/// Base mainnet addresses:
///   USDC   0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913  (6 dec)
///   Pyth   0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a
///   DECANT 0x10feE05Ef916625FD86b2fED432e325bE897BBa3  (18 dec)
///
/// Env:
///   PRIVATE_KEY   deployer key (holds Base mainnet ETH for gas)
///   GATE_MIN      min $DECANT (18-dec wei)            [default 50_000_000e18]
///   MAX_DEPOSIT   per-wallet deposit cap, USD WAD     [default 200e18]
///   MAX_OI        global open-interest cap, USD WAD   [default 2000e18]
///   MAX_LEV       max leverage, WAD                   [default 10e18]
///   ALLOWLIST     address to allowlist on all markets [default 0]
///
/// Run:
///   forge script script/DeployBaseMainnetIndexPnl.s.sol \
///     --rpc-url https://mainnet.base.org --broadcast
contract DeployBaseMainnetIndexPnl is Script {
    bytes32 constant ETH_USD = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant BTC_USD = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;
    bytes32 constant SOL_USD = 0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d;
    uint256 constant MAX_AGE = 3600;

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address pythAddr = vm.envOr("PYTH", address(0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a));
        address usdcAddr = vm.envOr("USDC", address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913));
        address gateToken = vm.envOr("GATE_TOKEN", address(0x10feE05Ef916625FD86b2fED432e325bE897BBa3));

        uint256 gateMin = vm.envOr("GATE_MIN", uint256(50_000_000e18));
        uint256 maxDeposit = vm.envOr("MAX_DEPOSIT", uint256(200e18));
        uint256 maxOi = vm.envOr("MAX_OI", uint256(2000e18));
        uint256 maxLev = vm.envOr("MAX_LEV", uint256(10e18));
        address allowlist = vm.envOr("ALLOWLIST", address(0));

        vm.startBroadcast(pk);

        (address ethMkt, address ethOracle) =
            _deploy(pythAddr, ETH_USD, usdcAddr, gateToken, gateMin, maxDeposit, maxOi, maxLev, allowlist);
        (address btcMkt, address btcOracle) =
            _deploy(pythAddr, BTC_USD, usdcAddr, gateToken, gateMin, maxDeposit, maxOi, maxLev, allowlist);
        (address solMkt, address solOracle) =
            _deploy(pythAddr, SOL_USD, usdcAddr, gateToken, gateMin, maxDeposit, maxOi, maxLev, allowlist);

        vm.stopBroadcast();

        console2.log("=== Decant index-based PnL redeploy (Base mainnet) ===");
        console2.log("ETH market:  ", ethMkt);
        console2.log("ETH oracle:  ", ethOracle);
        console2.log("BTC market:  ", btcMkt);
        console2.log("BTC oracle:  ", btcOracle);
        console2.log("SOL market:  ", solMkt);
        console2.log("SOL oracle:  ", solOracle);
        console2.log("Gate min:    ", gateMin);
        console2.log("Max deposit: ", maxDeposit);
        console2.log("Max OI:      ", maxOi);
        console2.log("Max leverage:", maxLev);
        console2.log("Allowlisted: ", allowlist);
    }

    function _deploy(
        address pythAddr,
        bytes32 feed,
        address usdcAddr,
        address gateToken,
        uint256 gateMin,
        uint256 maxDeposit,
        uint256 maxOi,
        uint256 maxLev,
        address allowlist
    ) internal returns (address market, address oracle) {
        PythOracle o = new PythOracle(IPyth(pythAddr), feed, MAX_AGE);
        uint256 price = _price(IPyth(pythAddr), feed);
        uint256 baseReserve = 1000e18;
        PerpMarket m = new PerpMarket(IERC20(usdcAddr), IOracle(address(o)), baseReserve, baseReserve * price / 1e18);
        m.setRiskParams(maxLev, 0.01e18, 0.005e18, 0.001e18);
        m.setGate(IERC20(gateToken), gateMin);
        m.setCaps(maxDeposit, maxOi);
        if (allowlist != address(0)) {
            m.setAllowlist(allowlist, true);
        }
        return (address(m), address(o));
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
