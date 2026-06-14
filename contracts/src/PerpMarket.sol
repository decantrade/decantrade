// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IOracle} from "./interfaces/IOracle.sol";

/// @title PerpMarket
/// @notice Minimal isolated-margin perpetual futures market on a virtual AMM (vAMM).
///         One market per deployment (e.g. ETH/USD). Collateral is a single ERC20
///         (e.g. USDC). Mark price comes from the vAMM; the oracle provides the index
///         price used for funding and liquidation. This is an MVP for Base testnet —
///         NOT audited, NOT for mainnet funds.
///
/// Units: prices, sizes, notionals and margins are all 1e18-scaled ("WAD") internally.
/// Collateral token amounts use the token's own decimals at the contract boundary.
contract PerpMarket {
    // ----- Constants -----
    uint256 internal constant WAD = 1e18;

    // ----- Immutables / config -----
    IERC20 public immutable collateral;
    uint256 public immutable collateralScale; // 10**(18 - tokenDecimals)
    uint256 public immutable k; // vAMM invariant: baseReserve * quoteReserve (constant)

    address public owner;
    IOracle public oracle;

    // Risk params (1e18-scaled fractions)
    uint256 public maxLeverage = 50e18; // 50x
    uint256 public maintenanceMarginRatio = 0.01e18; // 1%
    uint256 public liquidationFeeRatio = 0.005e18; // 0.5% of notional to liquidator
    uint256 public tradingFeeRatio = 0.001e18; // 0.10% of notional

    // ----- Guarded-launch controls (all disabled by default) -----
    // Access gate: when gateToken != address(0), callers must be allowlisted
    // or hold >= gateMinBalance of gateToken to deposit / open.
    IERC20 public gateToken;
    uint256 public gateMinBalance;
    mapping(address => bool) public allowlist;

    // Per-wallet net-deposit cap (WAD). 0 = unlimited.
    uint256 public maxDepositPerWallet;
    mapping(address => uint256) public netDeposited; // deposits - withdrawals, WAD

    // Global open-interest cap on aggregate open notional (WAD). 0 = unlimited.
    uint256 public maxOpenInterest;
    uint256 public totalOpenInterest;

    // Emergency pause: blocks new deposits / opens. Close & withdraw stay open.
    bool public paused;

    // ----- vAMM state (WAD) -----
    uint256 public baseReserve; // virtual token reserve
    uint256 public quoteReserve; // virtual USD reserve

    // ----- Funding -----
    uint256 public fundingInterval = 1 hours;
    uint256 public lastFundingTime;
    int256 public cumulativePremiumFraction; // WAD USD per token

    // ----- Accounting (WAD) -----
    uint256 public insuranceFund;
    mapping(address => uint256) public freeCollateral; // available, not locked in a position

    struct Position {
        int256 size; // base token, signed (+long / -short), WAD
        uint256 openNotional; // quote put in at open, WAD
        uint256 margin; // locked collateral, WAD
        int256 lastPremium; // cumulativePremiumFraction snapshot at open
    }

    mapping(address => Position) public positions;

    // ----- Reentrancy guard -----
    uint256 private _locked = 1;

    modifier nonReentrant() {
        require(_locked == 1, "REENTRANT");
        _locked = 2;
        _;
        _locked = 1;
    }

    modifier onlyOwner() {
        require(msg.sender == owner, "NOT_OWNER");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "PAUSED");
        _;
    }

    modifier onlyGated() {
        require(_isGated(msg.sender), "NOT_GATED");
        _;
    }

    /// @dev True when the account may trade: no gate set, allowlisted, or holds enough gateToken.
    function _isGated(address account) internal view returns (bool) {
        if (address(gateToken) == address(0)) return true;
        if (allowlist[account]) return true;
        return gateToken.balanceOf(account) >= gateMinBalance;
    }

    // ----- Events -----
    event Deposited(address indexed trader, uint256 amount);
    event Withdrawn(address indexed trader, uint256 amount);
    event PositionOpened(
        address indexed trader, bool isLong, uint256 margin, uint256 notional, int256 size, uint256 markPrice
    );
    event PositionClosed(address indexed trader, int256 pnl, int256 funding, uint256 markPrice);
    event Liquidated(address indexed trader, address indexed liquidator, uint256 reward, int256 net);
    event FundingSettled(int256 premiumFraction, int256 cumulative, uint256 markPrice, uint256 indexPrice);
    event PausedSet(bool paused);
    event GateSet(address gateToken, uint256 gateMinBalance);
    event AllowlistSet(address indexed account, bool allowed);
    event CapsSet(uint256 maxDepositPerWallet, uint256 maxOpenInterest);

    constructor(IERC20 _collateral, IOracle _oracle, uint256 _baseReserve, uint256 _quoteReserve) {
        require(_baseReserve > 0 && _quoteReserve > 0, "BAD_RESERVES");
        owner = msg.sender;
        collateral = _collateral;
        oracle = _oracle;
        uint8 dec = _collateral.decimals();
        require(dec <= 18, "DECIMALS");
        collateralScale = 10 ** (18 - dec);
        baseReserve = _baseReserve;
        quoteReserve = _quoteReserve;
        k = _baseReserve * _quoteReserve;
        lastFundingTime = block.timestamp;
    }

    // ============================================================
    //                        Collateral
    // ============================================================

    function deposit(uint256 amount) external nonReentrant whenNotPaused onlyGated {
        require(amount > 0, "ZERO");
        uint256 wad = amount * collateralScale;
        if (maxDepositPerWallet > 0) {
            require(netDeposited[msg.sender] + wad <= maxDepositPerWallet, "DEPOSIT_CAP");
        }
        require(collateral.transferFrom(msg.sender, address(this), amount), "TRANSFER_FAIL");
        freeCollateral[msg.sender] += wad;
        netDeposited[msg.sender] += wad;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external nonReentrant {
        require(amount > 0, "ZERO");
        uint256 wad = amount * collateralScale;
        require(freeCollateral[msg.sender] >= wad, "INSUFFICIENT");
        freeCollateral[msg.sender] -= wad;
        // Free up deposit-cap headroom as capital leaves.
        netDeposited[msg.sender] = wad >= netDeposited[msg.sender] ? 0 : netDeposited[msg.sender] - wad;
        require(collateral.transfer(msg.sender, amount), "TRANSFER_FAIL");
        emit Withdrawn(msg.sender, amount);
    }

    // ============================================================
    //                        Trading
    // ============================================================

    function openPosition(bool isLong, uint256 marginAmount, uint256 leverage)
        external
        nonReentrant
        whenNotPaused
        onlyGated
    {
        require(positions[msg.sender].size == 0, "POSITION_EXISTS");
        require(leverage > 0 && leverage <= maxLeverage, "BAD_LEVERAGE");
        require(marginAmount > 0 && freeCollateral[msg.sender] >= marginAmount, "INSUFFICIENT_MARGIN");

        _settleFunding();

        uint256 notional = (marginAmount * leverage) / WAD;
        uint256 fee = (notional * tradingFeeRatio) / WAD;
        require(marginAmount > fee, "MARGIN_LT_FEE");
        if (maxOpenInterest > 0) {
            require(totalOpenInterest + notional <= maxOpenInterest, "OI_CAP");
        }
        totalOpenInterest += notional;

        freeCollateral[msg.sender] -= marginAmount;
        insuranceFund += fee;

        int256 size;
        if (isLong) {
            uint256 newQuote = quoteReserve + notional;
            uint256 newBase = k / newQuote;
            size = int256(baseReserve - newBase);
            baseReserve = newBase;
            quoteReserve = newQuote;
        } else {
            require(notional < quoteReserve, "NOTIONAL_TOO_BIG");
            uint256 newQuote = quoteReserve - notional;
            uint256 newBase = k / newQuote;
            size = -int256(newBase - baseReserve);
            baseReserve = newBase;
            quoteReserve = newQuote;
        }

        positions[msg.sender] = Position({
            size: size, openNotional: notional, margin: marginAmount - fee, lastPremium: cumulativePremiumFraction
        });

        emit PositionOpened(msg.sender, isLong, marginAmount - fee, notional, size, getMarkPrice());
    }

    function closePosition() external nonReentrant {
        _close(msg.sender, false, msg.sender);
    }

    /// @notice Liquidate an under-margined position. Caller earns a reward.
    function liquidate(address trader) external nonReentrant {
        _settleFunding();
        require(_marginRatio(trader) < int256(maintenanceMarginRatio), "NOT_LIQUIDATABLE");
        _close(trader, true, msg.sender);
    }

    function _close(address trader, bool isLiquidation, address liquidator) internal {
        Position memory pos = positions[trader];
        require(pos.size != 0, "NO_POSITION");

        if (!isLiquidation) {
            _settleFunding();
        }

        // Swap the position back into the vAMM and compute realized PnL.
        (int256 pnl, uint256 closeNotional) = _simulateClose(pos.size, pos.openNotional);
        if (pos.size > 0) {
            uint256 newBase = baseReserve + uint256(pos.size);
            quoteReserve = k / newBase;
            baseReserve = newBase;
        } else {
            uint256 newBase = baseReserve - uint256(-pos.size);
            quoteReserve = k / newBase;
            baseReserve = newBase;
        }

        // Release this position's contribution to aggregate open interest.
        totalOpenInterest = pos.openNotional >= totalOpenInterest ? 0 : totalOpenInterest - pos.openNotional;

        int256 funding = (pos.size * (cumulativePremiumFraction - pos.lastPremium)) / int256(WAD);
        uint256 fee = (closeNotional * tradingFeeRatio) / WAD;
        insuranceFund += fee;

        int256 net = int256(pos.margin) + pnl - funding - int256(fee);

        delete positions[trader];

        uint256 payoutPool = net > 0 ? uint256(net) : 0;

        if (isLiquidation) {
            uint256 reward = (closeNotional * liquidationFeeRatio) / WAD;
            if (reward > payoutPool) reward = payoutPool;
            freeCollateral[liquidator] += reward;
            uint256 remainder = payoutPool - reward;
            if (remainder > 0) freeCollateral[trader] += remainder;
            emit Liquidated(trader, liquidator, reward, net);
        } else {
            if (payoutPool > 0) freeCollateral[trader] += payoutPool;
        }

        // Cover bad debt from the insurance fund where possible.
        if (net < 0) {
            uint256 badDebt = uint256(-net);
            insuranceFund -= badDebt > insuranceFund ? insuranceFund : badDebt;
        }

        emit PositionClosed(trader, pnl, funding, getMarkPrice());
    }

    // ============================================================
    //                        Funding
    // ============================================================

    function settleFunding() external nonReentrant {
        _settleFunding();
    }

    function _settleFunding() internal {
        uint256 dt = block.timestamp - lastFundingTime;
        if (dt == 0) return;
        uint256 index = oracle.getPrice();
        uint256 mark = getMarkPrice();
        int256 premiumFraction = ((int256(mark) - int256(index)) * int256(dt)) / int256(fundingInterval);
        cumulativePremiumFraction += premiumFraction;
        lastFundingTime = block.timestamp;
        emit FundingSettled(premiumFraction, cumulativePremiumFraction, mark, index);
    }

    // ============================================================
    //                        Views
    // ============================================================

    function getMarkPrice() public view returns (uint256) {
        return (quoteReserve * WAD) / baseReserve;
    }

    function getIndexPrice() external view returns (uint256) {
        return oracle.getPrice();
    }

    /// @notice Unrealized PnL of a trader's position at current vAMM price (WAD, signed).
    function unrealizedPnl(address trader) public view returns (int256 pnl) {
        Position memory pos = positions[trader];
        if (pos.size == 0) return 0;
        (pnl,) = _simulateClose(pos.size, pos.openNotional);
    }

    /// @notice Account value = margin + unrealized PnL - pending funding (WAD, signed).
    function accountValue(address trader) public view returns (int256) {
        Position memory pos = positions[trader];
        if (pos.size == 0) return 0;
        (int256 pnl,) = _simulateClose(pos.size, pos.openNotional);
        int256 funding = (pos.size * (cumulativePremiumFraction - pos.lastPremium)) / int256(WAD);
        return int256(pos.margin) + pnl - funding;
    }

    /// @notice Margin ratio = accountValue / currentNotional (WAD, signed). type(int).max if flat.
    function marginRatio(address trader) external view returns (int256) {
        return _marginRatio(trader);
    }

    function _marginRatio(address trader) internal view returns (int256) {
        Position memory pos = positions[trader];
        if (pos.size == 0) return type(int256).max;
        uint256 absSize = pos.size > 0 ? uint256(pos.size) : uint256(-pos.size);
        uint256 notional = (absSize * getMarkPrice()) / WAD;
        if (notional == 0) return type(int256).max;
        return (accountValue(trader) * int256(WAD)) / int256(notional);
    }

    /// @dev Simulate closing `size` (held against `openNotional`) at current reserves.
    ///      Returns (realized pnl, close notional). Does not mutate state.
    function _simulateClose(int256 size, uint256 openNotional)
        internal
        view
        returns (int256 pnl, uint256 closeNotional)
    {
        if (size > 0) {
            uint256 newBase = baseReserve + uint256(size);
            uint256 newQuote = k / newBase;
            uint256 quoteOut = quoteReserve - newQuote; // proceeds from selling base
            closeNotional = quoteOut;
            pnl = int256(quoteOut) - int256(openNotional);
        } else {
            uint256 absSize = uint256(-size);
            uint256 newBase = baseReserve - absSize;
            uint256 newQuote = k / newBase;
            uint256 quoteIn = newQuote - quoteReserve; // cost to buy base back
            closeNotional = quoteIn;
            pnl = int256(openNotional) - int256(quoteIn);
        }
    }

    // ============================================================
    //                        Admin
    // ============================================================

    function addInsurance(uint256 amount) external nonReentrant {
        require(amount > 0, "ZERO");
        require(collateral.transferFrom(msg.sender, address(this), amount), "TRANSFER_FAIL");
        insuranceFund += amount * collateralScale;
    }

    function setOracle(IOracle _oracle) external onlyOwner {
        oracle = _oracle;
    }

    function setRiskParams(
        uint256 _maxLeverage,
        uint256 _maintenanceMarginRatio,
        uint256 _liquidationFeeRatio,
        uint256 _tradingFeeRatio
    ) external onlyOwner {
        maxLeverage = _maxLeverage;
        maintenanceMarginRatio = _maintenanceMarginRatio;
        liquidationFeeRatio = _liquidationFeeRatio;
        tradingFeeRatio = _tradingFeeRatio;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "ZERO_ADDR");
        owner = newOwner;
    }

    // ----- Guarded-launch admin -----

    function setPaused(bool _paused) external onlyOwner {
        paused = _paused;
        emit PausedSet(_paused);
    }

    /// @notice Set the holder gate. gateToken == address(0) disables gating.
    function setGate(IERC20 _gateToken, uint256 _gateMinBalance) external onlyOwner {
        gateToken = _gateToken;
        gateMinBalance = _gateMinBalance;
        emit GateSet(address(_gateToken), _gateMinBalance);
    }

    function setAllowlist(address account, bool allowed) external onlyOwner {
        allowlist[account] = allowed;
        emit AllowlistSet(account, allowed);
    }

    /// @notice Set caps. 0 disables the respective cap.
    function setCaps(uint256 _maxDepositPerWallet, uint256 _maxOpenInterest) external onlyOwner {
        maxDepositPerWallet = _maxDepositPerWallet;
        maxOpenInterest = _maxOpenInterest;
        emit CapsSet(_maxDepositPerWallet, _maxOpenInterest);
    }
}
