// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {MarketFactory} from "../src/MarketFactory.sol";
import {IPyth} from "../src/oracle/PythOracle.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";

/// @notice Deploys the guarded permissionless MarketFactory to Base mainnet.
///
/// Unlike the testnet script this creates NO market — the curated ETH/BTC/SOL
/// markets already exist and are independent. It only deploys the factory and
/// tunes the permissionless TWAP guardrails (G3/G5/G6/G7/G8/G9). Governor is the
/// deployer; markets created through it are owned by the governor.
///
/// Env (all guard values overridable; defaults are the proposed mainnet policy):
///   PRIVATE_KEY        - deployer (= initial governor)
///   USDC               - collateral (default Base mainnet USDC)
///   PYTH               - Pyth contract (default Base mainnet)
///   UNIV3_FACTORY      - canonical Uniswap V3 factory (default Base mainnet)
///   MIN_POOL_LIQUIDITY - reject dust pools (raw pool.liquidity() L, default 1e17)
///   TWAP_MAX_LEVERAGE  - factory market leverage cap (WAD, default 2e18)
///   MAX_DEPOSIT_WALLET - per-wallet deposit cap (WAD USD, default 200e18)
///   MAX_OPEN_INTEREST  - market OI cap (WAD USD, default 5000e18)
///   MIN_CREATOR_INSURANCE - creator-seeded isolated insurance (USDC 6dec, default 50e6)
///   LAUNCH_FEE         - anti-spam launch fee to governor (USDC 6dec, default 10e6)
///   MARK_BAND_BPS      - initial mark must be within ± this of index (default 2000 = 20%)
contract DeployFactoryMainnet is Script {
    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address me = vm.addr(pk);
        address usdc = vm.envOr("USDC", address(0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913));
        address pythAddr = vm.envOr("PYTH", address(0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a));
        address univ3 = vm.envOr("UNIV3_FACTORY", address(0x33128a8fC17869897dcE68Ed026d694621f6FDfD));

        uint128 minPoolLiquidity = uint128(vm.envOr("MIN_POOL_LIQUIDITY", uint256(1e17)));
        uint256 twapMaxLeverage = vm.envOr("TWAP_MAX_LEVERAGE", uint256(2e18));
        uint256 maxDepositWallet = vm.envOr("MAX_DEPOSIT_WALLET", uint256(200e18));
        uint256 maxOpenInterest = vm.envOr("MAX_OPEN_INTEREST", uint256(5000e18));
        uint256 minCreatorInsurance = vm.envOr("MIN_CREATOR_INSURANCE", uint256(50e6));
        uint256 launchFee = vm.envOr("LAUNCH_FEE", uint256(10e6));
        uint256 markBandBps = vm.envOr("MARK_BAND_BPS", uint256(2000));

        vm.startBroadcast(pk);
        MarketFactory factory = new MarketFactory(IERC20(usdc), IPyth(pythAddr), me, univ3);
        factory.setTwapGuards(minPoolLiquidity, twapMaxLeverage, maxDepositWallet, maxOpenInterest);
        factory.setLaunchEconomics(minCreatorInsurance, launchFee, markBandBps);
        vm.stopBroadcast();

        console2.log("MarketFactory:        ", address(factory));
        console2.log("governor:             ", me);
        console2.log("collateral (USDC):    ", usdc);
        console2.log("univ3 factory:        ", univ3);
        console2.log("minTwapWindow (s):    ", factory.minTwapWindow());
        console2.log("minPoolLiquidity:     ", factory.minPoolLiquidity());
        console2.log("twapMaxLeverage:      ", factory.twapMaxLeverage());
        console2.log("maxDeposit/wallet:    ", factory.twapMaxDepositPerWallet());
        console2.log("maxOpenInterest:      ", factory.twapMaxOpenInterest());
        console2.log("minCreatorInsurance:  ", factory.minCreatorInsurance());
        console2.log("launchFee:            ", factory.launchFee());
        console2.log("markBandBps:          ", factory.markBandBps());
        console2.log("markets count:        ", factory.allMarketsLength());
    }
}
