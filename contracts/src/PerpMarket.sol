// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "./interfaces/IERC20.sol";
import {IOracle} from "./interfaces/IOracle.sol";

/// @title PerpMarket
/// @notice Minimal isolated-margin perpetual futures market on Base.
///         One market per deployment (e.g. ETH/USD). Collateral is a single ERC20
///         (e.g. USDC). PnL, position size and liquidation are priced off the
///         oracle index price, so a trader's PnL tracks the real asset price
///         (size * priceDelta). The vAMM reserves still track order flow and
///         provide the mark price used to compute funding (mark vs index). The
///         protocol is the counterparty to open positions. NOT audited.
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
        uint256 openNotional; // notional at open (margin * leverage), WAD
        uint256 margin; // locked collateral, WAD
        int256 lastPremium; // cumulativePremiumFraction snapshot at open
        uint256 entryPrice; // oracle index price at open, WAD
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
    event MarginAdjusted(address indexed trader, int256 marginDelta, uint256 newMargin);
    event PartialClosed(address indexed trader, uint256 fraction, int256 pnl, int256 funding, uint256 markPrice);

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

        // Size is priced off the oracle so that size * entryPrice == notional.
        uint256 entryPrice = oracle.getPrice();
        require(entryPrice > 0, "NO_PRICE");
        uint256 sizeAbs = (notional * WAD) / entryPrice;
        require(sizeAbs > 0, "DUST");

        // Push the vAMM reserves by the traded size so the mark price reflects
        // order flow (used by funding). PnL itself is oracle-priced.
        int256 size;
        if (isLong) {
            require(sizeAbs < baseReserve, "SIZE_TOO_BIG");
            size = int256(sizeAbs);
            baseReserve -= sizeAbs;
            quoteReserve = k / baseReserve;
        } else {
            size = -int256(sizeAbs);
            baseReserve += sizeAbs;
            quoteReserve = k / baseReserve;
        }

        positions[msg.sender] = Position({
            size: size,
            openNotional: notional,
            margin: marginAmount - fee,
            lastPremium: cumulativePremiumFraction,
            entryPrice: entryPrice
        });

        emit PositionOpened(msg.sender, isLong, marginAmount - fee, notional, size, entryPrice);
    }

    function closePosition() external nonReentrant {
        _close(msg.sender, false, msg.sender);
    }

    /// @notice Close a fraction of the caller's position (WAD; 1e18 = 100%).
    ///         Realizes PnL, funding and fees pro-rata on the closed slice; the
    ///         remaining position keeps the same margin ratio. A full close
    ///         (fraction == WAD) is routed through the normal close path.
    function closePartial(uint256 fraction) external nonReentrant {
        require(fraction > 0 && fraction <= WAD, "BAD_FRACTION");
        if (fraction == WAD) {
            _close(msg.sender, false, msg.sender);
            return;
        }
        Position memory pos = positions[msg.sender];
        require(pos.size != 0, "NO_POSITION");

        _settleFunding();

        int256 closeSize = (pos.size * int256(fraction)) / int256(WAD);
        require(closeSize != 0, "DUST");
        uint256 closeOpenNotional = (pos.openNotional * fraction) / WAD;

        (int256 pnl, uint256 closeNotional) = _simulateClose(closeSize, pos.entryPrice);
        if (closeSize > 0) {
            uint256 newBase = baseReserve + uint256(closeSize);
            quoteReserve = k / newBase;
            baseReserve = newBase;
        } else {
            uint256 newBase = baseReserve - uint256(-closeSize);
            quoteReserve = k / newBase;
            baseReserve = newBase;
        }

        totalOpenInterest = closeOpenNotional >= totalOpenInterest ? 0 : totalOpenInterest - closeOpenNotional;

        int256 funding = (closeSize * (cumulativePremiumFraction - pos.lastPremium)) / int256(WAD);
        uint256 fee = (closeNotional * tradingFeeRatio) / WAD;
        insuranceFund += fee;

        uint256 releasedMargin = (pos.margin * fraction) / WAD;
        int256 net = int256(releasedMargin) + pnl - funding - int256(fee);

        // Shrink the position pro-rata; lastPremium stays so the remaining slice
        // keeps accruing funding from the original open.
        positions[msg.sender].size = pos.size - closeSize;
        positions[msg.sender].openNotional = pos.openNotional - closeOpenNotional;
        positions[msg.sender].margin = pos.margin - releasedMargin;

        if (net > 0) {
            freeCollateral[msg.sender] += uint256(net);
        } else if (net < 0) {
            uint256 badDebt = uint256(-net);
            insuranceFund -= badDebt > insuranceFund ? insuranceFund : badDebt;
        }

        emit PartialClosed(msg.sender, fraction, pnl, funding, getMarkPrice());
    }

    /// @notice Add free collateral to an open position (WAD), lowering its
    ///         leverage and liquidation risk.
    function addMargin(uint256 amount) external nonReentrant {
        require(amount > 0, "ZERO");
        Position storage pos = positions[msg.sender];
        require(pos.size != 0, "NO_POSITION");
        require(freeCollateral[msg.sender] >= amount, "INSUFFICIENT");
        freeCollateral[msg.sender] -= amount;
        pos.margin += amount;
        emit MarginAdjusted(msg.sender, int256(amount), pos.margin);
    }

    /// @notice Remove collateral from an open position (WAD). Reverts if it would
    ///         exceed max leverage or drop below the maintenance margin.
    function removeMargin(uint256 amount) external nonReentrant {
        require(amount > 0, "ZERO");
        Position storage pos = positions[msg.sender];
        require(pos.size != 0, "NO_POSITION");
        require(pos.margin > amount, "INSUFFICIENT_MARGIN");
        _settleFunding();
        uint256 newMargin = pos.margin - amount;
        require((pos.openNotional * WAD) / newMargin <= maxLeverage, "EXCEEDS_MAX_LEVERAGE");
        pos.margin = newMargin;
        require(_marginRatio(msg.sender) >= int256(maintenanceMarginRatio), "UNDER_MAINTENANCE");
        freeCollateral[msg.sender] += amount;
        emit MarginAdjusted(msg.sender, -int256(amount), newMargin);
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

        // Realize oracle-priced PnL and push the size back into the vAMM reserves.
        (int256 pnl, uint256 closeNotional) = _simulateClose(pos.size, pos.entryPrice);
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

    /// @notice Unrealized PnL of a trader's position at the current index price (WAD, signed).
    function unrealizedPnl(address trader) public view returns (int256 pnl) {
        Position memory pos = positions[trader];
        if (pos.size == 0) return 0;
        (pnl,) = _simulateClose(pos.size, pos.entryPrice);
    }

    /// @notice Account value = margin + unrealized PnL - pending funding (WAD, signed).
    function accountValue(address trader) public view returns (int256) {
        Position memory pos = positions[trader];
        if (pos.size == 0) return 0;
        (int256 pnl,) = _simulateClose(pos.size, pos.entryPrice);
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
        uint256 notional = (absSize * oracle.getPrice()) / WAD;
        if (notional == 0) return type(int256).max;
        return (accountValue(trader) * int256(WAD)) / int256(notional);
    }

    /// @dev Oracle-priced PnL for closing `size` opened at `entryPrice`.
    ///      pnl = size * (indexPrice - entryPrice); closeNotional = |size| * indexPrice.
    ///      Signed `size` handles both directions (long profits when price rises,
    ///      short profits when it falls). Does not mutate state.
    function _simulateClose(int256 size, uint256 entryPrice) internal view returns (int256 pnl, uint256 closeNotional) {
        uint256 px = oracle.getPrice();
        uint256 absSize = size > 0 ? uint256(size) : uint256(-size);
        closeNotional = (absSize * px) / WAD;
        pnl = (size * (int256(px) - int256(entryPrice))) / int256(WAD);
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
