// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IOracle} from "./interfaces/IOracle.sol";
import {PerpMarket} from "./PerpMarket.sol";
import {PythOracle, IPyth} from "./oracle/PythOracle.sol";
import {UniswapV3TwapOracle} from "./oracle/UniswapV3TwapOracle.sol";

/// @title MarketFactory
/// @notice Permissionless launcher for Decant perp markets. Anyone can spin up a new
///         isolated vAMM market — either against a Pyth feed (curated assets like
///         ETH/BTC) or, for arbitrary tokens, a Uniswap V3 TWAP fallback.
///
/// @dev "Permissionless to create, safe by construction": the creator picks the oracle
///      and seed reserves (bounded by a depth floor), but the factory fixes the
///      collateral, applies vetted risk params, and assigns market ownership to the
///      protocol governor — so a market creator cannot later swap the oracle or
///      change risk params to rug traders.
contract MarketFactory {
    enum OracleKind {
        Pyth,
        UniswapV3Twap
    }

    // ----- Config -----
    address public governor; // owns deployed markets; tunes factory defaults
    IERC20 public immutable collateral; // single canonical collateral (e.g. USDC)
    IPyth public immutable pyth; // Pyth contract on this chain (may be address(0))

    uint256 public minBaseReserve = 1e18; // vAMM depth floor
    uint256 public pythMaxAge = 3600; // staleness window for Pyth oracles
    uint32 public minTwapWindow = 1800; // 30 min minimum TWAP window

    // Risk params applied to every market (1e18-scaled).
    uint256 public maxLeverage = 50e18;
    uint256 public maintenanceMarginRatio = 0.01e18;
    uint256 public liquidationFeeRatio = 0.005e18;
    uint256 public tradingFeeRatio = 0.001e18;

    // ----- Registry -----
    address[] public allMarkets;
    mapping(bytes32 => address) public marketForKey; // dedupe key -> market

    modifier onlyGovernor() {
        require(msg.sender == governor, "NOT_GOVERNOR");
        _;
    }

    event MarketCreated(
        address indexed market,
        address indexed oracle,
        address indexed creator,
        OracleKind kind,
        bytes32 key,
        uint256 baseReserve,
        uint256 quoteReserve
    );

    constructor(IERC20 _collateral, IPyth _pyth, address _governor) {
        require(_governor != address(0), "ZERO_GOVERNOR");
        collateral = _collateral;
        pyth = _pyth;
        governor = _governor;
    }

    function allMarketsLength() external view returns (uint256) {
        return allMarkets.length;
    }

    // ============================================================
    //                     Permissionless create
    // ============================================================

    /// @notice Launch a market priced by a Pyth feed (e.g. ETH/USD, BTC/USD).
    function createPythMarket(bytes32 priceId, uint256 baseReserve, uint256 quoteReserve)
        external
        returns (address market)
    {
        require(address(pyth) != address(0), "NO_PYTH");
        bytes32 key = keccak256(abi.encode(OracleKind.Pyth, priceId));
        IOracle oracle = new PythOracle(pyth, priceId, pythMaxAge);
        market = _deploy(oracle, key, OracleKind.Pyth, baseReserve, quoteReserve);
    }

    /// @notice Launch a market for an arbitrary token priced by a Uniswap V3 TWAP.
    /// @param pool      the Uniswap V3 pool (must contain `baseToken` and `collateral`)
    /// @param baseToken the token being priced
    /// @param twapWindow averaging window in seconds (>= minTwapWindow)
    function createTwapMarket(
        address pool,
        address baseToken,
        uint32 twapWindow,
        uint256 baseReserve,
        uint256 quoteReserve
    ) external returns (address market) {
        require(twapWindow >= minTwapWindow, "WINDOW_TOO_SHORT");
        bytes32 key = keccak256(abi.encode(OracleKind.UniswapV3Twap, pool, baseToken));
        IOracle oracle = new UniswapV3TwapOracle(pool, baseToken, address(collateral), twapWindow);
        market = _deploy(oracle, key, OracleKind.UniswapV3Twap, baseReserve, quoteReserve);
    }

    function _deploy(IOracle oracle, bytes32 key, OracleKind kind, uint256 baseReserve, uint256 quoteReserve)
        internal
        returns (address market)
    {
        require(marketForKey[key] == address(0), "MARKET_EXISTS");
        require(baseReserve >= minBaseReserve && quoteReserve > 0, "RESERVES_TOO_SMALL");

        PerpMarket m = new PerpMarket(collateral, oracle, baseReserve, quoteReserve);
        m.setRiskParams(maxLeverage, maintenanceMarginRatio, liquidationFeeRatio, tradingFeeRatio);
        m.transferOwnership(governor);

        market = address(m);
        marketForKey[key] = market;
        allMarkets.push(market);
        emit MarketCreated(market, address(oracle), msg.sender, kind, key, baseReserve, quoteReserve);
    }

    // ============================================================
    //                          Governance
    // ============================================================

    function setGovernor(address _governor) external onlyGovernor {
        require(_governor != address(0), "ZERO_GOVERNOR");
        governor = _governor;
    }

    function setLimits(uint256 _minBaseReserve, uint256 _pythMaxAge, uint32 _minTwapWindow) external onlyGovernor {
        require(_minBaseReserve > 0 && _pythMaxAge > 0 && _minTwapWindow > 0, "BAD_LIMITS");
        minBaseReserve = _minBaseReserve;
        pythMaxAge = _pythMaxAge;
        minTwapWindow = _minTwapWindow;
    }

    function setRiskDefaults(
        uint256 _maxLeverage,
        uint256 _maintenanceMarginRatio,
        uint256 _liquidationFeeRatio,
        uint256 _tradingFeeRatio
    ) external onlyGovernor {
        maxLeverage = _maxLeverage;
        maintenanceMarginRatio = _maintenanceMarginRatio;
        liquidationFeeRatio = _liquidationFeeRatio;
        tradingFeeRatio = _tradingFeeRatio;
    }
}
