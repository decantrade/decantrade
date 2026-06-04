// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {PerpMarket} from "../src/PerpMarket.sol";
import {PythOracle, IPyth} from "../src/oracle/PythOracle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {IERC20} from "../src/interfaces/IERC20.sol";
import {IOracle} from "../src/interfaces/IOracle.sol";

/// @notice Deploys the Decant MVP (ETH/USD + BTC/USD markets) to Base Sepolia.
///
/// Env:
///   PRIVATE_KEY   - deployer key (must hold Base Sepolia ETH)
///   PYTH          - Pyth contract on Base Sepolia
///                   (default 0xA2aa501b19aff244D90cc15a4Cf739D2725B5729 — verify at
///                    https://docs.pyth.network/price-feeds/contract-addresses/evm)
///   USDC          - collateral token; if 0, a test MockERC20 (6 dec) is deployed
///
/// Run:
///   forge script script/DeployBaseSepolia.s.sol \
///     --rpc-url $BASE_SEPOLIA_RPC --broadcast
contract DeployBaseSepolia is Script {
    // Network-agnostic Pyth price feed IDs.
    bytes32 constant ETH_USD = 0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace;
    bytes32 constant BTC_USD = 0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43;

    uint256 constant MAX_AGE = 3600; // seconds; lenient for testnet (Pyth pushes can lapse)

    function run() external {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address pythAddr = vm.envOr("PYTH", address(0xA2aa501b19aff244D90cc15a4Cf739D2725B5729));
        address usdcAddr = vm.envOr("USDC", address(0));

        vm.startBroadcast(pk);

        IERC20 usdc;
        if (usdcAddr == address(0)) {
            MockERC20 testUsdc = new MockERC20("Decant Test USD", "tUSDC", 6);
            usdc = IERC20(address(testUsdc));
            console2.log("Deployed test USDC:", address(testUsdc));
        } else {
            usdc = IERC20(usdcAddr);
        }

        PythOracle ethOracle = new PythOracle(IPyth(pythAddr), ETH_USD, MAX_AGE);
        PythOracle btcOracle = new PythOracle(IPyth(pythAddr), BTC_USD, MAX_AGE);

        // Seed each vAMM at the live Pyth price so mark ≈ index at launch (no skewed
        // funding on day one). Base reserve sets depth; quote = base * price.
        uint256 ethPrice = _price(IPyth(pythAddr), ETH_USD);
        uint256 btcPrice = _price(IPyth(pythAddr), BTC_USD);
        uint256 ethBase = 1000e18;
        uint256 btcBase = 50e18;
        PerpMarket ethMarket = new PerpMarket(usdc, IOracle(address(ethOracle)), ethBase, ethBase * ethPrice / 1e18);
        PerpMarket btcMarket = new PerpMarket(usdc, IOracle(address(btcOracle)), btcBase, btcBase * btcPrice / 1e18);

        vm.stopBroadcast();

        console2.log("Pyth:        ", pythAddr);
        console2.log("ETH oracle:  ", address(ethOracle));
        console2.log("BTC oracle:  ", address(btcOracle));
        console2.log("ETH market:  ", address(ethMarket));
        console2.log("BTC market:  ", address(btcMarket));
        console2.log("ETH seed px: ", ethPrice);
        console2.log("BTC seed px: ", btcPrice);
    }

    /// @dev Reads the latest Pyth price for `id` and scales it to 1e18 USD/token.
    function _price(IPyth pyth, bytes32 id) internal view returns (uint256) {
        IPyth.Price memory p = pyth.getPriceUnsafe(id);
        require(p.price > 0, "BAD_SEED_PRICE");
        uint256 raw = uint256(uint64(p.price));
        int256 targetExpo = int256(18) + int256(p.expo);
        if (targetExpo >= 0) return raw * (10 ** uint256(targetExpo));
        return raw / (10 ** uint256(-targetExpo));
    }
}
