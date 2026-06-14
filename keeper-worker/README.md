# Decant keeper — Cloudflare Cron Worker

A serverless version of the Decant keeper that runs on a Cloudflare **Cron
Trigger** (no always-on server to babysit). On every tick it:

- **settles funding** (`settleFunding`) on each `PerpMarket` so the funding
  premium keeps accruing even when nobody is trading, and
- **liquidates** under-margined positions (`liquidate(trader)`), earning the
  liquidation reward. Both calls are permissionless, so the bot only needs gas.

Open positions are discovered by following `PositionOpened` / `PositionClosed` /
`Liquidated` logs. The last scanned block and the set of currently-open traders
per market are persisted in **Workers KV**, so each run only scans newly produced
blocks.

> This is the same logic as the Node keeper in [`../keeper`](../keeper); that
> package additionally runs a full SQLite event indexer + read API. This worker
> is the minimal "keep the markets healthy" piece, deployable with zero infra.

## Schedule

Configured in `wrangler.jsonc` as `* * * * *` (every minute):

- **Liquidation sweep** runs every minute (the margin-ratio reads are free).
- **Funding settlement** runs roughly every 10 minutes (minute % 10 === 0) to
  conserve the keeper's gas balance.

## Config

`wrangler.jsonc`:

- `vars.RPC_URL` — Base Sepolia RPC (defaults to `https://sepolia.base.org`).
- `kv_namespaces[KEEPER_KV]` — index state. Create with
  `wrangler kv namespace create KEEPER_KV` and paste the `id`.
- Optional `vars.MARKETS` (`"ETH:0x..,BTC:0x.."`) and `vars.START_BLOCK` to
  override the live Base Sepolia ETH/BTC/SOL markets.

Secrets (`wrangler secret put <NAME>`):

- `KEEPER_PRIVATE_KEY` — a **funded** Base Sepolia key the bot signs with. With
  no key set the worker runs read-only (indexes, sends no tx).
- `RUN_TOKEN` — guards the manual `GET /run` trigger.

## Deploy

```bash
cd keeper-worker
npm install
npx wrangler kv namespace create KEEPER_KV   # paste id into wrangler.jsonc
npx wrangler secret put KEEPER_PRIVATE_KEY
npx wrangler secret put RUN_TOKEN
npx wrangler deploy
```

## Mainnet (Base, chain 8453)

A **separate** worker (`decant-keeper-mainnet`) runs against the guarded Base
mainnet market, using its own config + KV namespace so the testnet keeper above
is untouched. See `wrangler.mainnet.jsonc`:

- `vars.RPC_URL` — `https://base-rpc.publicnode.com` (more reliable than the
  rate-limited `mainnet.base.org` for `eth_getLogs` + tx submission).
- `vars.CHAIN_ID` — `8453`. **Required on mainnet:** the worker spreads
  `baseSepolia` for its chain object, so without this the signed txs would carry
  the wrong EIP-155 chainId (84532) and get rejected.
- `vars.MARKETS` — `ETH:0x010820DC816Aa354C05770cEb7A8567d123DBbE4`.

Deploy / set secrets with `--config wrangler.mainnet.jsonc`:

```bash
npx wrangler kv namespace create KEEPER_KV_MAINNET   # paste id into wrangler.mainnet.jsonc
printf '0x%s' "$KEY" | npx wrangler secret put KEEPER_PRIVATE_KEY --config wrangler.mainnet.jsonc
npx wrangler secret put RUN_TOKEN --config wrangler.mainnet.jsonc
npx wrangler deploy --config wrangler.mainnet.jsonc
```

## HTTP endpoints

The worker also serves a small HTTP surface on its `workers.dev` URL:

| Route | Description |
| --- | --- |
| `GET /health` | cursor, chain head, open-position counts, keeper address + balance |
| `GET /run?key=<RUN_TOKEN>` | run one keeper pass now (indexes + settles funding + liquidates) and return the result |

## Notes

- The worker does **not** wait for tx receipts inside a run (to stay within
  Worker subrequest limits); it assigns sequential nonces and broadcasts. Check
  results on-chain or via the next `/health` call.
- Initial backfill is bounded to `MAX_CHUNKS_PER_RUN` `eth_getLogs` calls per
  run, so the cursor catches up over a few ticks after first deploy.
