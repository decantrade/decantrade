# Decant keeper + indexer

Off-chain infrastructure for the Decant perp markets on Base:

- **Indexer** — backfills and follows `PerpMarket` events (`Deposited`, `Withdrawn`,
  `PositionOpened`, `PositionClosed`, `Liquidated`, `FundingSettled`) into a local
  SQLite database, and maintains the set of currently-open positions per market.
- **Keeper bot** — periodically:
  - **liquidates** under-margined positions: reads `marginRatio(trader)` for every open
    position and calls `liquidate(trader)` when it drops below `maintenanceMarginRatio`.
    The caller (this bot) earns the liquidation reward.
  - **settles funding**: calls `settleFunding()` on each market so the funding premium
    keeps accruing even when no one is trading.
- **Read API** — a tiny HTTP server exposing the indexed data (history, open positions,
  liquidations, funding) for a UI or for monitoring.

This is testnet MVP infrastructure — not audited.

## Run

```bash
cd keeper
pnpm install
cp .env.example .env   # then edit as needed

# indexer + read API only (no liquidation/funding txs sent):
pnpm start

# full keeper (set KEEPER_PRIVATE_KEY in .env to a funded account first):
pnpm start

# one-shot: backfill + a single liquidation sweep, then exit:
pnpm once
```

With no `KEEPER_PRIVATE_KEY` set, the bot runs in **dry-run** mode: it indexes events and
logs which positions *would* be liquidated, but sends no transactions. This is the safe
default for just indexing or for monitoring.

The defaults target the live Base Sepolia ETH/BTC/SOL markets. Override `MARKETS`,
`RPC_URL`, `CHAIN_ID`, and `START_BLOCK` for other deployments (see `.env.example`).

## Read API

Default port `8787`.

| Route | Description |
| --- | --- |
| `GET /health` | event counts per kind + per-market sync cursors |
| `GET /markets` | configured markets |
| `GET /events?market=&trader=&limit=` | raw indexed events (newest first) |
| `GET /trades?market=&limit=` | opens / closes / liquidations |
| `GET /liquidations?limit=` | liquidation events |
| `GET /funding?market=&limit=` | funding settlements |
| `GET /positions?market=` | currently-open positions (keeper watch list) |

Event `data` is the decoded log args as JSON, with all `uint256`/`int256` values encoded
as decimal strings (WAD, i.e. 1e18-scaled prices/sizes/notionals).

## Local liquidation demo

The contracts repo ships `script/KeeperScenario.s.sol`, which deploys a fresh market on a
local anvil, opens a 10x long, then crashes the mark price with an opposing short so the
long falls below maintenance margin. Run anvil, broadcast the script, then point the keeper
at the printed market address with a funded anvil key and `CHAIN_ID=31337` — it detects the
under-margined position, liquidates it, and indexes the resulting `Liquidated` event.

## Notes

- Backfill uses `eth_getLogs` in `LOG_CHUNK`-block ranges; the public Base RPC caps this at
  2000 blocks. A dedicated RPC can use a larger chunk.
- The keeper sends one transaction at a time and waits for the receipt, so a single funded
  key is enough for testnet. It is permissionless: `liquidate` and `settleFunding` can be
  called by anyone, so the bot only needs gas (no special role).
