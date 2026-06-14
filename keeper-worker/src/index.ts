/**
 * Decant keeper + indexer — Cloudflare Cron Worker.
 *
 * On a schedule (see wrangler.jsonc `triggers.crons`) it:
 *   1. indexes new PerpMarket events (deposits, trades, liquidations, funding)
 *      into Workers KV — a capped recent-activity feed + a realized-PnL
 *      leaderboard + totals,
 *   2. settles funding (`settleFunding`, permissionless) on each market, and
 *   3. liquidates under-margined positions (`liquidate(trader)`).
 *
 * State is persisted in Workers KV:
 *   - `state`       — { cursor, open } : last scanned block + open-trader set/market
 *   - `events`      — capped list of recent decoded events (newest first)
 *   - `leaderboard` — per-trader { realizedPnl, volume, trades, liquidations }
 *   - `stats`       — totals
 * To respect KV's free-tier write budget, `state` is written every run but the
 * indexer blobs are only written when new events are found.
 *
 * The signing key is the Worker secret KEEPER_PRIVATE_KEY. With no key the
 * worker still indexes but sends no tx (dry-run).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  formatEther,
  formatUnits,
  decodeEventLog,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export interface Env {
  KEEPER_KV: KVNamespace;
  KEEPER_PRIVATE_KEY?: string;
  RPC_URL?: string;
  CHAIN_ID?: string;
  MARKETS?: string;
  START_BLOCK?: string;
  RUN_TOKEN?: string;
}

type Market = { key: string; address: Address };

const DEFAULT_MARKETS: Market[] = [
  { key: "ETH", address: "0xB92951edfeC55296D593be9EA3858337cBc199cc" },
  { key: "BTC", address: "0x1D482BcEfe1a4ECBa59662b76D1265DfCa2A94b1" },
  { key: "SOL", address: "0xFb9a9df405Ffd8BAa9dAd9CC02946CDEFb2e34a7" },
  { key: "SPCX", address: "0x4e65a31d3A1ee088492bb3CE3E8CA3AD7C37Cd30" },
];

const DEFAULT_START_BLOCK = 42326000n;
const LOG_CHUNK = 2000n; // public Base RPC caps eth_getLogs at 2000 blocks
const MAX_CHUNKS_PER_RUN = 12; // bound subrequests per invocation
const MAX_EVENTS = 1000; // cap the recent-activity feed kept in KV
const MAX_TS_LOOKUPS = 25; // bound block-timestamp fetches per run

// PerpMarket ABI: events we index + views/calls the keeper uses.
const perpMarketAbi = [
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionOpened",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "isLong", type: "bool", indexed: false },
      { name: "margin", type: "uint256", indexed: false },
      { name: "notional", type: "uint256", indexed: false },
      { name: "size", type: "int256", indexed: false },
      { name: "markPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionClosed",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "pnl", type: "int256", indexed: false },
      { name: "funding", type: "int256", indexed: false },
      { name: "markPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Liquidated",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "liquidator", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
      { name: "net", type: "int256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FundingSettled",
    inputs: [
      { name: "premiumFraction", type: "int256", indexed: false },
      { name: "cumulative", type: "int256", indexed: false },
      { name: "markPrice", type: "uint256", indexed: false },
      { name: "indexPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "function",
    name: "marginRatio",
    stateMutability: "view",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ type: "int256" }],
  },
  {
    type: "function",
    name: "maintenanceMarginRatio",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "settleFunding", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "liquidate",
    stateMutability: "nonpayable",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [],
  },
] as const;

// Events the indexer follows (excludes FundingSettled, which has no trader and
// would flood the feed — funding is summarised elsewhere).
const TRADER_EVENTS = ["Deposited", "Withdrawn", "PositionOpened", "PositionClosed", "Liquidated"];
const keeperEvents = perpMarketAbi.filter(
  (x) => x.type === "event" && TRADER_EVENTS.includes(x.name),
) as Extract<(typeof perpMarketAbi)[number], { type: "event" }>[];

// FundingSettled is indexed separately into a compact history (no trader, would
// otherwise flood the activity feed).
const fundingEvents = perpMarketAbi.filter(
  (x) => x.type === "event" && x.name === "FundingSettled",
) as Extract<(typeof perpMarketAbi)[number], { type: "event" }>[];
const indexedEvents = [...keeperEvents, ...fundingEvents];
const MAX_FUNDING = 200; // cap the funding history kept in KV

function parseMarkets(env: Env): Market[] {
  const raw = env.MARKETS?.trim();
  if (!raw) return DEFAULT_MARKETS;
  return raw.split(",").map((part) => {
    const [key, address] = part.split(":");
    return { key: key.trim(), address: address.trim() as Address };
  });
}

function chainFor(rpcUrl: string, chainId: number = baseSepolia.id) {
  // Spreading baseSepolia keeps its id (84532); override it so signed txs carry
  // the right EIP-155 chainId for the target network (e.g. 8453 Base mainnet).
  return defineChain({ ...baseSepolia, id: chainId, rpcUrls: { default: { http: [rpcUrl] } } });
}

const wad = (v: bigint, dp = 4) => Number(formatUnits(v, 18)).toFixed(dp);
// Collateral (deposit/withdraw) amounts are emitted in the token's own decimals.
const COLLATERAL_DECIMALS = 6;
const tok = (v: bigint, dp = 2) => Number(formatUnits(v, COLLATERAL_DECIMALS)).toFixed(dp);

type OpenSets = Record<string, string[]>;
type State = { cursor: string; open: OpenSets };

type IndexedEvent = {
  kind: string;
  market: string;
  trader: string;
  block: number;
  ts: number; // unix seconds (0 if unknown)
  tx: string;
  logIndex: number;
  // human-readable, market-relevant fields (decimal strings)
  side?: "long" | "short";
  size?: string;
  notional?: string;
  margin?: string;
  amount?: string;
  pnl?: string;
  reward?: string;
};

type FundingRecord = {
  market: string;
  block: number;
  ts: number;
  tx: string;
  logIndex: number;
  mark: string;
  index: string;
  premium: string;
};

type LeaderRow = { realizedPnl: string; volume: string; trades: number; liquidations: number };
type Leaderboard = Record<string, LeaderRow>;
type Stats = {
  deposits: number;
  withdrawals: number;
  opens: number;
  closes: number;
  liquidations: number;
  volume: string;
  updatedAt: number;
};

export type RunResult = {
  ok: boolean;
  head: string;
  cursorBefore: string;
  cursorAfter: string;
  caughtUp: boolean;
  open: Record<string, number>;
  indexed: number;
  funding: { market: string; hash?: string; error?: string }[];
  liquidations: { market: string; trader: string; hash?: string; error?: string }[];
  dryRun: boolean;
  keeper?: string;
  balanceEth?: string;
};

export type RunOpts = { settleFunding?: boolean };

async function loadState(env: Env, startBlock: bigint, markets: Market[]): Promise<State> {
  const raw = await env.KEEPER_KV.get("state");
  if (raw) {
    const s = JSON.parse(raw) as State;
    for (const m of markets) s.open[m.key] ??= [];
    return s;
  }
  // migrate from the older split keys if present
  const oldCursor = await env.KEEPER_KV.get("cursor");
  const oldOpen = await env.KEEPER_KV.get("open");
  const open: OpenSets = oldOpen ? JSON.parse(oldOpen) : {};
  for (const m of markets) open[m.key] ??= [];
  return { cursor: oldCursor ?? (startBlock - 1n).toString(), open };
}

/** One full pass: index new logs into KV, then settle funding + liquidate. */
export async function runOnce(env: Env, opts: RunOpts = {}): Promise<RunResult> {
  const doFunding = opts.settleFunding ?? true;
  const rpcUrl = env.RPC_URL || "https://sepolia.base.org";
  const markets = parseMarkets(env);
  const chain = chainFor(rpcUrl, Number(env.CHAIN_ID || baseSepolia.id));
  const client = createPublicClient({ chain, transport: http(rpcUrl) });
  const byAddress = new Map<string, string>(markets.map((m) => [m.address.toLowerCase(), m.key]));

  const startBlock = env.START_BLOCK ? BigInt(env.START_BLOCK) : DEFAULT_START_BLOCK;
  const state = await loadState(env, startBlock, markets);
  let cursor = BigInt(state.cursor);
  const open = state.open;

  const head = await client.getBlockNumber();
  const cursorBefore = cursor;

  // ---- index new logs in bounded chunks ----
  const newEvents: IndexedEvent[] = [];
  const newFunding: FundingRecord[] = [];
  let from = cursor + 1n;
  let chunks = 0;
  while (from <= head && chunks < MAX_CHUNKS_PER_RUN) {
    const to = from + LOG_CHUNK - 1n > head ? head : from + LOG_CHUNK - 1n;
    try {
      const logs = await client.getLogs({
        address: markets.map((m) => m.address),
        events: indexedEvents,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const key = byAddress.get(log.address.toLowerCase());
        if (!key) continue;
        const ev = decodeIndexed(log, key);
        if (ev) {
          // maintain open-trader set
          const set = new Set(open[key]);
          if (ev.kind === "PositionOpened") set.add(ev.trader);
          else if (ev.kind === "PositionClosed" || ev.kind === "Liquidated") set.delete(ev.trader);
          open[key] = [...set];
          newEvents.push(ev);
          continue;
        }
        const fe = decodeFunding(log, key);
        if (fe) newFunding.push(fe);
      }
    } catch (e) {
      console.warn(`[keeper] getLogs ${from}-${to} failed: ${errMsg(e)}`);
      break;
    }
    cursor = to;
    from = to + 1n;
    chunks++;
  }
  const caughtUp = cursor >= head;

  // ---- resolve block timestamps for new events (bounded) ----
  if (newEvents.length || newFunding.length) {
    const blocks = [
      ...new Set([...newEvents, ...newFunding].map((e) => e.block)),
    ].slice(0, MAX_TS_LOOKUPS);
    const tsByBlock = new Map<number, number>();
    for (const b of blocks) {
      try {
        const blk = await client.getBlock({ blockNumber: BigInt(b) });
        tsByBlock.set(b, Number(blk.timestamp));
      } catch { /* leave ts=0 */ }
    }
    for (const e of newEvents) e.ts = tsByBlock.get(e.block) ?? 0;
    for (const f of newFunding) f.ts = tsByBlock.get(f.block) ?? 0;
  }

  // ---- persist state (every run) + indexer blobs (only when new) ----
  await env.KEEPER_KV.put("state", JSON.stringify({ cursor: cursor.toString(), open }));
  if (newEvents.length) {
    await mergeIndex(env, newEvents);
  }
  if (newFunding.length) {
    await mergeFunding(env, newFunding);
  }

  const result: RunResult = {
    ok: true,
    head: head.toString(),
    cursorBefore: cursorBefore.toString(),
    cursorAfter: cursor.toString(),
    caughtUp,
    open: Object.fromEntries(markets.map((m) => [m.key, open[m.key].length])),
    indexed: newEvents.length,
    funding: [],
    liquidations: [],
    dryRun: !env.KEEPER_PRIVATE_KEY,
  };

  if (!env.KEEPER_PRIVATE_KEY) return result;

  const account = privateKeyToAccount(env.KEEPER_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  result.keeper = account.address;
  result.balanceEth = formatEther(await client.getBalance({ address: account.address }));

  let nonce = await client.getTransactionCount({ address: account.address, blockTag: "pending" });

  // ---- liquidation sweep ----
  for (const m of markets) {
    const traders = open[m.key];
    if (traders.length === 0) continue;
    let mmr: bigint;
    try {
      mmr = (await client.readContract({
        address: m.address,
        abi: perpMarketAbi,
        functionName: "maintenanceMarginRatio",
      })) as bigint;
    } catch (e) {
      console.warn(`[keeper] mmr ${m.key} failed: ${errMsg(e)}`);
      continue;
    }
    for (const trader of traders) {
      let ratio: bigint;
      try {
        ratio = (await client.readContract({
          address: m.address,
          abi: perpMarketAbi,
          functionName: "marginRatio",
          args: [trader as Address],
        })) as bigint;
      } catch {
        continue;
      }
      if (ratio >= mmr) continue;
      try {
        const hash = await wallet.writeContract({
          address: m.address,
          abi: perpMarketAbi,
          functionName: "liquidate",
          args: [trader as Address],
          nonce,
        });
        nonce++;
        result.liquidations.push({ market: m.key, trader, hash });
        console.log(`[keeper] liquidate ${trader} on ${m.key} → ${hash}`);
      } catch (e) {
        result.liquidations.push({ market: m.key, trader, error: errMsg(e) });
      }
    }
  }

  // ---- funding sweep ----
  if (doFunding)
    for (const m of markets) {
      try {
        const hash = await wallet.writeContract({
          address: m.address,
          abi: perpMarketAbi,
          functionName: "settleFunding",
          nonce,
        });
        nonce++;
        result.funding.push({ market: m.key, hash });
        console.log(`[keeper] settleFunding ${m.key} → ${hash}`);
      } catch (e) {
        result.funding.push({ market: m.key, error: errMsg(e) });
      }
    }

  return result;
}

function decodeIndexed(log: Log, market: string): IndexedEvent | null {
  let decoded: { eventName: string; args: Record<string, unknown> };
  try {
    decoded = decodeEventLog({
      abi: perpMarketAbi,
      data: log.data,
      topics: log.topics,
    }) as unknown as { eventName: string; args: Record<string, unknown> };
  } catch {
    return null;
  }
  const a = decoded.args;
  const trader = String(a.trader || "").toLowerCase();
  if (!trader) return null;
  const base: IndexedEvent = {
    kind: decoded.eventName,
    market,
    trader,
    block: Number(log.blockNumber ?? 0n),
    ts: 0,
    tx: log.transactionHash ?? "",
    logIndex: Number(log.logIndex ?? 0),
  };
  switch (decoded.eventName) {
    case "Deposited":
    case "Withdrawn":
      base.amount = tok(a.amount as bigint, 2);
      break;
    case "PositionOpened":
      base.side = (a.isLong as boolean) ? "long" : "short";
      base.margin = wad(a.margin as bigint, 2);
      base.notional = wad(a.notional as bigint, 2);
      base.size = wad((a.size as bigint) < 0n ? -(a.size as bigint) : (a.size as bigint), 4);
      break;
    case "PositionClosed":
      base.pnl = wad(a.pnl as bigint, 2);
      break;
    case "Liquidated":
      base.reward = wad(a.reward as bigint, 2);
      break;
  }
  return base;
}

function decodeFunding(log: Log, market: string): FundingRecord | null {
  let decoded: { eventName: string; args: Record<string, unknown> };
  try {
    decoded = decodeEventLog({
      abi: perpMarketAbi,
      data: log.data,
      topics: log.topics,
    }) as unknown as { eventName: string; args: Record<string, unknown> };
  } catch {
    return null;
  }
  if (decoded.eventName !== "FundingSettled") return null;
  const a = decoded.args;
  return {
    market,
    block: Number(log.blockNumber ?? 0n),
    ts: 0,
    tx: log.transactionHash ?? "",
    logIndex: Number(log.logIndex ?? 0),
    mark: wad(a.markPrice as bigint, 2),
    index: wad(a.indexPrice as bigint, 2),
    premium: wad(a.premiumFraction as bigint, 8),
  };
}

/** Merge new FundingSettled records into a capped KV history (dedup by tx:logIndex). */
async function mergeFunding(env: Env, recs: FundingRecord[]): Promise<void> {
  const raw = await env.KEEPER_KV.get("funding");
  const hist: FundingRecord[] = raw ? JSON.parse(raw) : [];
  const seen = new Set(hist.map((e) => `${e.tx}:${e.logIndex}`));
  for (const r of recs) {
    const id = `${r.tx}:${r.logIndex}`;
    if (seen.has(id)) continue;
    seen.add(id);
    hist.push(r);
  }
  hist.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
  await env.KEEPER_KV.put("funding", JSON.stringify(hist.slice(0, MAX_FUNDING)));
}

/** Merge new events into the KV feed + leaderboard + stats (dedup by tx:logIndex). */
async function mergeIndex(env: Env, evs: IndexedEvent[]): Promise<void> {
  const [feedRaw, lbRaw, statsRaw] = await Promise.all([
    env.KEEPER_KV.get("events"),
    env.KEEPER_KV.get("leaderboard"),
    env.KEEPER_KV.get("stats"),
  ]);
  const feed: IndexedEvent[] = feedRaw ? JSON.parse(feedRaw) : [];
  const lb: Leaderboard = lbRaw ? JSON.parse(lbRaw) : {};
  const stats: Stats = statsRaw
    ? JSON.parse(statsRaw)
    : { deposits: 0, withdrawals: 0, opens: 0, closes: 0, liquidations: 0, volume: "0", updatedAt: 0 };

  const seen = new Set(feed.map((e) => `${e.tx}:${e.logIndex}`));
  let volume = parseFloat(stats.volume) || 0;

  for (const e of evs) {
    const id = `${e.tx}:${e.logIndex}`;
    if (seen.has(id)) continue;
    seen.add(id);
    feed.push(e);
    const row = (lb[e.trader] ??= { realizedPnl: "0", volume: "0", trades: 0, liquidations: 0 });
    switch (e.kind) {
      case "Deposited":
        stats.deposits++;
        break;
      case "Withdrawn":
        stats.withdrawals++;
        break;
      case "PositionOpened":
        stats.opens++;
        row.trades++;
        row.volume = (parseFloat(row.volume) + parseFloat(e.notional || "0")).toString();
        volume += parseFloat(e.notional || "0");
        break;
      case "PositionClosed":
        stats.closes++;
        row.realizedPnl = (parseFloat(row.realizedPnl) + parseFloat(e.pnl || "0")).toString();
        break;
      case "Liquidated":
        stats.liquidations++;
        row.liquidations++;
        break;
    }
  }

  // newest first, capped
  feed.sort((a, b) => b.block - a.block || b.logIndex - a.logIndex);
  const capped = feed.slice(0, MAX_EVENTS);
  stats.volume = volume.toString();
  stats.updatedAt = Math.floor(Date.now() / 1000);

  await Promise.all([
    env.KEEPER_KV.put("events", JSON.stringify(capped)),
    env.KEEPER_KV.put("leaderboard", JSON.stringify(lb)),
    env.KEEPER_KV.put("stats", JSON.stringify(stats)),
  ]);
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message.split("\n")[0] : String(e);
}

const CORS = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, OPTIONS",
  "access-control-allow-headers": "content-type",
};

const worker = {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Liquidation checks run every tick (reads are free); only settle funding
    // roughly every 10 minutes to conserve the keeper's gas balance.
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const settleFunding = minute % 10 === 0;
    ctx.waitUntil(
      runOnce(env, { settleFunding })
        .then((r) =>
          console.log(
            `[keeper] run: head=${r.head} cursor=${r.cursorAfter} caughtUp=${r.caughtUp} ` +
              `indexed=${r.indexed} open=${JSON.stringify(r.open)} funding=${r.funding.length} ` +
              `liq=${r.liquidations.length} dryRun=${r.dryRun}`,
          ),
        )
        .catch((e) => console.error(`[keeper] run failed: ${errMsg(e)}`)),
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body, null, 2), {
        status,
        headers: { "content-type": "application/json", ...CORS },
      });

    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    const markets = parseMarkets(env);

    if (url.pathname === "/health") {
      const rpcUrl = env.RPC_URL || "https://sepolia.base.org";
      const client = createPublicClient({ chain: chainFor(rpcUrl, Number(env.CHAIN_ID || baseSepolia.id)), transport: http(rpcUrl) });
      const state = await loadState(env, DEFAULT_START_BLOCK, markets);
      let head = "?";
      let keeper: string | undefined;
      let balanceEth: string | undefined;
      try {
        head = (await client.getBlockNumber()).toString();
      } catch { /* ignore */ }
      if (env.KEEPER_PRIVATE_KEY) {
        const account = privateKeyToAccount(env.KEEPER_PRIVATE_KEY as Hex);
        keeper = account.address;
        try {
          balanceEth = formatEther(await client.getBalance({ address: account.address }));
        } catch { /* ignore */ }
      }
      return json({
        ok: true,
        cursor: state.cursor,
        head,
        markets: markets.map((m) => m.key),
        open: Object.fromEntries(markets.map((m) => [m.key, (state.open[m.key] || []).length])),
        keeper,
        balanceEth,
        dryRun: !env.KEEPER_PRIVATE_KEY,
      });
    }

    if (url.pathname === "/stats") {
      const stats = JSON.parse((await env.KEEPER_KV.get("stats")) || "{}");
      return json({ ok: true, stats });
    }

    if (url.pathname === "/activity" || url.pathname === "/trades") {
      const feed: IndexedEvent[] = JSON.parse((await env.KEEPER_KV.get("events")) || "[]");
      const trader = url.searchParams.get("trader")?.toLowerCase();
      const market = url.searchParams.get("market");
      const kind = url.searchParams.get("kind");
      const limit = Math.min(Number(url.searchParams.get("limit") || 50), MAX_EVENTS);
      let rows = feed;
      if (trader) rows = rows.filter((e) => e.trader === trader);
      if (market) rows = rows.filter((e) => e.market === market);
      if (kind) rows = rows.filter((e) => e.kind === kind);
      return json({ ok: true, count: rows.length, events: rows.slice(0, limit) });
    }

    if (url.pathname === "/leaderboard") {
      const lb: Leaderboard = JSON.parse((await env.KEEPER_KV.get("leaderboard")) || "{}");
      const sort = url.searchParams.get("sort") === "volume" ? "volume" : "realizedPnl";
      const limit = Math.min(Number(url.searchParams.get("limit") || 20), 200);
      const rows = Object.entries(lb)
        .map(([trader, r]) => ({ trader, ...r }))
        .sort((a, b) => parseFloat(b[sort]) - parseFloat(a[sort]))
        .slice(0, limit);
      return json({ ok: true, count: rows.length, leaderboard: rows });
    }

    if (url.pathname === "/positions") {
      const state = await loadState(env, DEFAULT_START_BLOCK, markets);
      return json({ ok: true, open: state.open });
    }

    if (url.pathname === "/funding") {
      const hist: FundingRecord[] = JSON.parse((await env.KEEPER_KV.get("funding")) || "[]");
      const market = url.searchParams.get("market");
      const limit = Math.min(Number(url.searchParams.get("limit") || 20), 200);
      const rows = (market ? hist.filter((f) => f.market === market) : hist).slice(0, limit);
      return json({ ok: true, count: rows.length, funding: rows });
    }

    // Manual trigger for testing/ops: GET /run?key=<RUN_TOKEN>
    if (url.pathname === "/run") {
      if (!env.RUN_TOKEN || url.searchParams.get("key") !== env.RUN_TOKEN) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      try {
        return json(await runOnce(env));
      } catch (e) {
        return json({ ok: false, error: errMsg(e) }, 500);
      }
    }

    return json({
      ok: true,
      service: "decant-keeper",
      routes: ["/health", "/stats", "/activity?trader=&market=&kind=&limit=", "/leaderboard?sort=&limit=", "/positions", "/funding?market=&limit=", "/run?key="],
    });
  },
};

export default worker;
