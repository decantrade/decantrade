# Decant Contracts — Perp Futures MVP (Base)

Smart contracts for **Decant**, a permissionless perpetual futures exchange on Base.
This repo is the **MVP / proof-of-mechanism**: an isolated-margin perpetual market on a
virtual AMM (vAMM), scoped to curated markets (ETH/USD, BTC/USD) priced by Pyth.

> ⚠️ **Not audited. Testnet only.** Do not use with real funds. This is an early MVP to
> validate the core trading mechanics before the permissionless market factory, full
> liquidation keeper network, and a security audit.

## What this is

- **Model:** vAMM (constant-product `x*y=k`). Mark price comes from the curve; the Pyth
  oracle provides the index price used for funding and liquidation. No order book, no
  market makers needed — so a market can run for any token with a price feed.
- **Margin:** isolated, single-collateral (**USDC**, 6 decimals). One position per trader
  per market.
- **Markets (MVP):** ETH/USD and BTC/USD (both have Pyth feeds on Base, so no TWAP
  fallback needed yet). The "any token" / permissionless factory is a later phase.

## Contracts

| Contract | Purpose |
| --- | --- |
| `src/PerpMarket.sol` | Core market: vAMM, deposit/withdraw, open/close, funding, liquidation, insurance fund. One deployment per market. |
| `src/oracle/PythOracle.sol` | Adapts a Pyth price feed to `IOracle` (USD/token, 1e18). Reverts on stale prices. |
| `src/interfaces/IOracle.sol` | Index price source (USD per token, 1e18-scaled). |
| `src/interfaces/IERC20.sol` | Minimal ERC20 used for collateral. |
| `src/mocks/MockERC20.sol` | Mintable token standing in for USDC (tests / testnet). |
| `src/mocks/MockOracle.sol` | Settable price oracle (tests). |

### Mechanics (PerpMarket)

- **Units:** prices, sizes, notionals and margins are 1e18-scaled ("WAD") internally;
  collateral uses the token's own decimals at the boundary.
- **vAMM:** reserves `(baseReserve, quoteReserve)` with constant `k`. Mark price =
  `quoteReserve / baseReserve`. Opening a long adds quote / removes base (price up);
  a short does the reverse.
- **Funding:** `settleFunding()` accrues a cumulative premium from `markPrice − indexPrice`
  scaled by elapsed time / `fundingInterval`. Longs pay shorts when mark > index.
- **Liquidation:** if `accountValue / notional < maintenanceMarginRatio` (default 6.25%),
  anyone can `liquidate(trader)` and earn a reward (default 1.25% of notional). Bad debt is
  absorbed by the per-market insurance fund.
- **Fees:** trading fee (default 0.10% of notional) accrues to the insurance fund.
- **Risk params** (`maxLeverage` 10x, maintenance 6.25%, liq fee 1.25%, trading fee 0.10%)
  are owner-tunable via `setRiskParams`.

## Develop

Requires [Foundry](https://book.getfoundry.sh/).

```bash
forge build          # compile
forge test -vv       # run the test suite (10 tests)
forge fmt            # format
```

### Tests (`test/PerpMarket.t.sol`)

Cover: deposit/withdraw, open long/short + price impact, PnL (long profits when price
rises, short when it falls), round-trip cost ≈ fees, funding (longs pay when mark > index),
and the full liquidation flow (not-liquidatable → under-maintenance → keeper reward).

## Deploy

### Local smoke test (anvil)

```bash
anvil &
export PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
forge script script/Smoke.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

Deploys mocks + an ETH market, then deposits, opens a 5x long, and closes — logging the
mark price at each step.

### Base Sepolia

```bash
export PRIVATE_KEY=<deployer key with Base Sepolia ETH>
export BASE_SEPOLIA_RPC=<rpc url>
# Optional: export USDC=<token>  (defaults to deploying a test MockERC20)
# Optional: export PYTH=<pyth addr>  (verify at docs.pyth.network)
forge script script/DeployBaseSepolia.s.sol --rpc-url $BASE_SEPOLIA_RPC --broadcast
```

Deploys ETH/USD and BTC/USD markets wired to Pyth. Pyth feed IDs are hardcoded in the
script; the Pyth contract address defaults to the common testnet deployment — **verify it
against the [Pyth EVM contract list](https://docs.pyth.network/price-feeds/contract-addresses/evm)
before deploying.**

## Roadmap (next)

1. **Permissionless `MarketFactory`** + TWAP oracle fallback (Aerodrome/Uniswap on Base) for
   tokens without a Pyth feed.
2. **Keeper bots** (liquidation + funding) and an **indexer** for positions / history.
3. **Trading UI** in the existing Next.js app (`decantrade.com`).
4. **Invariant/fuzz tests**, economic simulation, then a **security audit** before mainnet.
