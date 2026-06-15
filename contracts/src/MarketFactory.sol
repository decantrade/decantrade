// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IOracle} from "./interfaces/IOracle.sol";
import {PerpMarket} from "./PerpMarket.sol";
import {PythOracle, IPyth} from "./oracle/PythOracle.sol";
import {UniswapV3TwapOracle} from "./oracle/UniswapV3TwapOracle.sol";

/// @dev Minimal canonical Uniswap V3 pool surface used for guardrail checks.
interface IUniV3Pool {
    function token0() external view returns (address);
    function token1() external view returns (address);
    function fee() external view returns (uint24);
    function liquidity() external view returns (uint128);
    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128);
}

/// @dev The canonical Uniswap V3 factory maps (tokenA, tokenB, fee) -> the one pool
///      it deployed. Used to prove a pool address is a real Uniswap V3 pool and not
///      an attacker-controlled contract returning a forged TWAP.
interface IUniV3Factory {
    function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address);
}

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
///
///      Because PnL is index-priced (the protocol is the house), a forged or thin
///      oracle is a fund-loss vector. TWAP markets therefore pass strict guardrails:
///      the pool must be a canonical Uniswap V3 USDC pair with a liquidity floor and
///      a window its observation buffer supports; markets get low leverage, small
///      caps, and creator-seeded isolated insurance so any bad debt stays contained.
contract MarketFactory {
    enum OracleKind {
        Pyth,
        UniswapV3Twap
    }

    // ----- Config -----
    address public governor; // owns deployed markets; tunes factory defaults
    IERC20 public immutable collateral; // single canonical collateral (e.g. USDC)
    IPyth public immutable pyth; // Pyth contract on this chain (may be address(0))
    address public univ3Factory; // canonical Uniswap V3 factory (authenticity check)

    uint256 public minBaseReserve = 1e18; // vAMM depth floor
    uint256 public pythMaxAge = 3600; // staleness window for Pyth oracles
    uint32 public minTwapWindow = 1800; // 30 min minimum TWAP window

    // Risk params applied to curated (Pyth) markets (1e18-scaled).
    uint256 public maxLeverage = 50e18;
    uint256 public maintenanceMarginRatio = 0.01e18;
    uint256 public liquidationFeeRatio = 0.005e18;
    uint256 public tradingFeeRatio = 0.001e18;

    // ----- TWAP (permissionless "any token") guardrails -----
    uint128 public minPoolLiquidity = 0; // floor on pool.liquidity() (G3)
    uint256 public twapMaxLeverage = 2e18; // low leverage for volatile tokens (G5)
    uint256 public twapMaxDepositPerWallet = 0; // 0 = unset; per-wallet deposit cap (G6, WAD)
    uint256 public twapMaxOpenInterest = 0; // 0 = unset; market OI cap (G6, WAD)
    uint256 public minCreatorInsurance = 0; // USDC the creator must seed (G7, collateral units)
    uint256 public launchFee = 0; // anti-spam bond paid to governor (G8, collateral units)
    uint256 public markBandBps = 2000; // initial mark must be within ±20% of index (G9)

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

    constructor(IERC20 _collateral, IPyth _pyth, address _governor, address _univ3Factory) {
        require(_governor != address(0), "ZERO_GOVERNOR");
        collateral = _collateral;
        pyth = _pyth;
        governor = _governor;
        univ3Factory = _univ3Factory;
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
        market = _deploy(
            oracle, key, OracleKind.Pyth, baseReserve, quoteReserve, maxLeverage, 0, 0
        );
    }

    /// @notice Launch a market for an arbitrary token priced by a Uniswap V3 TWAP.
    /// @param pool       the Uniswap V3 pool (must be a canonical `baseToken`/USDC pool)
    /// @param baseToken  the token being priced
    /// @param twapWindow averaging window in seconds (>= minTwapWindow)
    /// @dev Guardrails G1–G4 are checked against `pool`; G5/G6 are applied to the new
    ///      market; G7/G8 pull USDC from the creator; G9 bounds the seeded mark price.
    function createTwapMarket(
        address pool,
        address baseToken,
        uint32 twapWindow,
        uint256 baseReserve,
        uint256 quoteReserve
    ) external returns (address market) {
        require(twapWindow >= minTwapWindow, "WINDOW_TOO_SHORT");
        _verifyPool(pool, baseToken, twapWindow);

        // G8: anti-spam launch bond paid to the governor.
        if (launchFee > 0) {
            require(collateral.transferFrom(msg.sender, governor, launchFee), "FEE_FAIL");
        }

        bytes32 key = keccak256(abi.encode(OracleKind.UniswapV3Twap, pool, baseToken));
        IOracle oracle = new UniswapV3TwapOracle(pool, baseToken, address(collateral), twapWindow);

        market = _deploy(
            oracle,
            key,
            OracleKind.UniswapV3Twap,
            baseReserve,
            quoteReserve,
            twapMaxLeverage,
            twapMaxDepositPerWallet,
            twapMaxOpenInterest
        );

        // G9: the seeded vAMM mark must start close to the real index price, else
        // funding would swing wildly from block one.
        _requireMarkInBand(PerpMarket(market).getMarkPrice(), oracle.getPrice());

        // G7: creator seeds isolated insurance so any bad debt stays in this market.
        if (minCreatorInsurance > 0) {
            require(collateral.transferFrom(msg.sender, address(this), minCreatorInsurance), "INSURANCE_FAIL");
            collateral.approve(market, minCreatorInsurance);
            PerpMarket(market).addInsurance(minCreatorInsurance);
        }
    }

    function _deploy(
        IOracle oracle,
        bytes32 key,
        OracleKind kind,
        uint256 baseReserve,
        uint256 quoteReserve,
        uint256 lev,
        uint256 maxDeposit,
        uint256 maxOI
    ) internal returns (address market) {
        require(marketForKey[key] == address(0), "MARKET_EXISTS");
        require(baseReserve >= minBaseReserve && quoteReserve > 0, "RESERVES_TOO_SMALL");

        PerpMarket m = new PerpMarket(collateral, oracle, baseReserve, quoteReserve);
        m.setRiskParams(lev, maintenanceMarginRatio, liquidationFeeRatio, tradingFeeRatio);
        if (maxDeposit > 0 || maxOI > 0) {
            m.setCaps(maxDeposit, maxOI);
        }
        m.transferOwnership(governor);

        market = address(m);
        marketForKey[key] = market;
        allMarkets.push(market);
        emit MarketCreated(market, address(oracle), msg.sender, kind, key, baseReserve, quoteReserve);
    }

    // ============================================================
    //                      TWAP pool guardrails
    // ============================================================

    /// @dev Enforces G1 (canonical pool), G2 (USDC pair), G3 (liquidity floor),
    ///      G4 (observation buffer supports the window). Reverts otherwise.
    function _verifyPool(address pool, address baseToken, uint32 twapWindow) internal view {
        require(univ3Factory != address(0), "NO_UNIV3_FACTORY");
        IUniV3Pool p = IUniV3Pool(pool);
        address t0 = p.token0();
        address t1 = p.token1();

        // G2: the pool must pair the base token with the canonical collateral (USDC).
        address quote = address(collateral);
        require((baseToken == t0 && quote == t1) || (baseToken == t1 && quote == t0), "POOL_NOT_USDC_PAIR");

        // G1: the canonical factory must map (t0, t1, fee) back to this exact pool.
        // A forged contract cannot satisfy this, defeating fake-oracle attacks.
        uint24 fee = p.fee();
        require(IUniV3Factory(univ3Factory).getPool(t0, t1, fee) == pool, "POOL_NOT_CANONICAL");

        // G3: liquidity floor — reject dust pools that are cheap to manipulate.
        require(p.liquidity() >= minPoolLiquidity, "POOL_TOO_THIN");

        // G4: the pool's observation buffer must cover the full TWAP window, else
        // `observe` reverts ("OLD"). Probing it here fails closed at creation time.
        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = twapWindow;
        secondsAgos[1] = 0;
        p.observe(secondsAgos);
    }

    /// @dev G9: require `mark` within ±markBandBps of `index` (both 1e18-scaled).
    function _requireMarkInBand(uint256 mark, uint256 index) internal view {
        require(index > 0 && mark > 0, "ZERO_PRICE");
        uint256 hi = index * (10_000 + markBandBps) / 10_000;
        uint256 lo = index * (10_000 - markBandBps) / 10_000;
        require(mark >= lo && mark <= hi, "MARK_OUT_OF_BAND");
    }

    // ============================================================
    //                          Governance
    // ============================================================

    function setGovernor(address _governor) external onlyGovernor {
        require(_governor != address(0), "ZERO_GOVERNOR");
        governor = _governor;
    }

    function setUniV3Factory(address _univ3Factory) external onlyGovernor {
        univ3Factory = _univ3Factory;
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

    /// @notice Tune the permissionless TWAP guardrails.
    function setTwapGuards(
        uint128 _minPoolLiquidity,
        uint256 _twapMaxLeverage,
        uint256 _twapMaxDepositPerWallet,
        uint256 _twapMaxOpenInterest
    ) external onlyGovernor {
        require(_twapMaxLeverage > 0, "BAD_LEVERAGE");
        minPoolLiquidity = _minPoolLiquidity;
        twapMaxLeverage = _twapMaxLeverage;
        twapMaxDepositPerWallet = _twapMaxDepositPerWallet;
        twapMaxOpenInterest = _twapMaxOpenInterest;
    }

    /// @notice Tune launch economics: required creator insurance + anti-spam fee
    ///         (both in collateral's smallest units), and the mark/index band (bps).
    function setLaunchEconomics(uint256 _minCreatorInsurance, uint256 _launchFee, uint256 _markBandBps)
        external
        onlyGovernor
    {
        require(_markBandBps > 0 && _markBandBps < 10_000, "BAD_BAND");
        minCreatorInsurance = _minCreatorInsurance;
        launchFee = _launchFee;
        markBandBps = _markBandBps;
    }
}
