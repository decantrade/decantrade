/**
 * Decant keeper — Cloudflare Cron Worker.
 *
 * Runs on a schedule (see wrangler.jsonc `triggers.crons`) and, for every
 * configured PerpMarket on Base Sepolia:
 *   - settles funding (`settleFunding`, permissionless) so the funding premium
 *     keeps accruing even when nobody is trading, and
 *   - liquidates under-margined positions (`liquidate(trader)`), earning the
 *     liquidation reward.
 *
 * Open positions are discovered by following PositionOpened / PositionClosed /
 * Liquidated logs. A small amount of state (the last scanned block + the set of
 * currently-open traders per market) is persisted in Workers KV so each run only
 * scans the newly produced blocks.
 *
 * The signing key is provided as the Worker secret KEEPER_PRIVATE_KEY. With no
 * key set the worker runs read-only (it updates its index but sends no tx).
 */
import {
  createPublicClient,
  createWalletClient,
  http,
  defineChain,
  formatEther,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export interface Env {
  KEEPER_KV: KVNamespace;
  KEEPER_PRIVATE_KEY?: string;
  RPC_URL?: string;
  MARKETS?: string;
  START_BLOCK?: string;
  RUN_TOKEN?: string;
}

type Market = { key: string; address: Address };

const DEFAULT_MARKETS: Market[] = [
  { key: "ETH", address: "0xB92951edfeC55296D593be9EA3858337cBc199cc" },
  { key: "BTC", address: "0x1D482BcEfe1a4ECBa59662b76D1265DfCa2A94b1" },
  { key: "SOL", address: "0xFb9a9df405Ffd8BAa9dAd9CC02946CDEFb2e34a7" },
];

const DEFAULT_START_BLOCK = 42326000n;
const LOG_CHUNK = 2000n; // public Base RPC caps eth_getLogs at 2000 blocks
const MAX_CHUNKS_PER_RUN = 12; // bound subrequests per invocation

// Minimal PerpMarket ABI: the events we follow + the views/calls the keeper uses.
const perpMarketAbi = [
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

// The events the indexer follows (subset of the ABI above), for getLogs typing.
const keeperEvents = perpMarketAbi.filter((x) => x.type === "event") as Extract<
  (typeof perpMarketAbi)[number],
  { type: "event" }
>[];

function parseMarkets(env: Env): Market[] {
  const raw = env.MARKETS?.trim();
  if (!raw) return DEFAULT_MARKETS;
  return raw.split(",").map((part) => {
    const [key, address] = part.split(":");
    return { key: key.trim(), address: address.trim() as Address };
  });
}

function chainFor(rpcUrl: string) {
  return defineChain({
    ...baseSepolia,
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

type OpenSets = Record<string, string[]>;

export type RunResult = {
  ok: boolean;
  head: string;
  cursorBefore: string;
  cursorAfter: string;
  caughtUp: boolean;
  open: Record<string, number>;
  funding: { market: string; hash?: string; error?: string }[];
  liquidations: { market: string; trader: string; hash?: string; error?: string }[];
  dryRun: boolean;
  keeper?: string;
  balanceEth?: string;
};

export type RunOpts = {
  /** Whether to send settleFunding txs this pass (liquidation always runs). */
  settleFunding?: boolean;
};

/** One full keeper pass: index new logs, then settle funding + liquidate. */
export async function runOnce(env: Env, opts: RunOpts = {}): Promise<RunResult> {
  const doFunding = opts.settleFunding ?? true;
  const rpcUrl = env.RPC_URL || "https://sepolia.base.org";
  const markets = parseMarkets(env);
  const chain = chainFor(rpcUrl);
  const client = createPublicClient({ chain, transport: http(rpcUrl) });

  const byAddress = new Map<string, string>(
    markets.map((m) => [m.address.toLowerCase(), m.key]),
  );

  // ---- load persisted state ----
  const startBlock = env.START_BLOCK ? BigInt(env.START_BLOCK) : DEFAULT_START_BLOCK;
  const cursorRaw = await env.KEEPER_KV.get("cursor");
  let cursor = cursorRaw ? BigInt(cursorRaw) : startBlock - 1n;
  const open: OpenSets = JSON.parse((await env.KEEPER_KV.get("open")) || "{}");
  for (const m of markets) open[m.key] ??= [];

  const head = await client.getBlockNumber();
  const cursorBefore = cursor;

  // ---- index new logs in bounded chunks ----
  let from = cursor + 1n;
  let chunks = 0;
  while (from <= head && chunks < MAX_CHUNKS_PER_RUN) {
    const to = from + LOG_CHUNK - 1n > head ? head : from + LOG_CHUNK - 1n;
    try {
      const logs = await client.getLogs({
        address: markets.map((m) => m.address),
        events: keeperEvents,
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const key = byAddress.get(log.address.toLowerCase());
        if (!key) continue;
        const name = log.eventName;
        const trader = ((log.args as { trader?: string }).trader || "").toLowerCase();
        if (!trader) continue;
        const set = new Set(open[key]);
        if (name === "PositionOpened") set.add(trader);
        else if (name === "PositionClosed" || name === "Liquidated") set.delete(trader);
        open[key] = [...set];
      }
    } catch (e) {
      // stop indexing on RPC error; cursor stays so we retry this range next run
      console.warn(`[keeper] getLogs ${from}-${to} failed: ${errMsg(e)}`);
      break;
    }
    cursor = to;
    from = to + 1n;
    chunks++;
  }
  const caughtUp = cursor >= head;

  await env.KEEPER_KV.put("open", JSON.stringify(open));
  await env.KEEPER_KV.put("cursor", cursor.toString());

  const result: RunResult = {
    ok: true,
    head: head.toString(),
    cursorBefore: cursorBefore.toString(),
    cursorAfter: cursor.toString(),
    caughtUp,
    open: Object.fromEntries(markets.map((m) => [m.key, open[m.key].length])),
    funding: [],
    liquidations: [],
    dryRun: !env.KEEPER_PRIVATE_KEY,
  };

  if (!env.KEEPER_PRIVATE_KEY) return result; // read-only / dry-run

  const account = privateKeyToAccount(env.KEEPER_PRIVATE_KEY as Hex);
  const wallet = createWalletClient({ account, chain, transport: http(rpcUrl) });
  result.keeper = account.address;
  result.balanceEth = formatEther(await client.getBalance({ address: account.address }));

  // Manual nonce management: we don't wait for receipts, so assign sequential
  // nonces and only advance on a successful broadcast.
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
      if (ratio >= mmr) continue; // healthy
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

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message.split("\n")[0] : String(e);
}

export default {
  async scheduled(event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // Liquidation checks run every minute (reads are free); only settle funding
    // roughly every 10 minutes to conserve the keeper's gas balance.
    const minute = new Date(event.scheduledTime).getUTCMinutes();
    const settleFunding = minute % 10 === 0;
    ctx.waitUntil(
      runOnce(env, { settleFunding })
        .then((r) =>
          console.log(
            `[keeper] run: head=${r.head} cursor=${r.cursorAfter} caughtUp=${r.caughtUp} ` +
              `open=${JSON.stringify(r.open)} funding=${r.funding.length} liq=${r.liquidations.length} dryRun=${r.dryRun}`,
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
        headers: { "content-type": "application/json" },
      });

    if (url.pathname === "/health") {
      const rpcUrl = env.RPC_URL || "https://sepolia.base.org";
      const markets = parseMarkets(env);
      const client = createPublicClient({ chain: chainFor(rpcUrl), transport: http(rpcUrl) });
      const open: OpenSets = JSON.parse((await env.KEEPER_KV.get("open")) || "{}");
      const cursor = (await env.KEEPER_KV.get("cursor")) || "unset";
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
        cursor,
        head,
        markets: markets.map((m) => m.key),
        open: Object.fromEntries(markets.map((m) => [m.key, (open[m.key] || []).length])),
        keeper,
        balanceEth,
        dryRun: !env.KEEPER_PRIVATE_KEY,
      });
    }

    // Manual trigger for testing/ops: GET /run?key=<RUN_TOKEN>
    if (url.pathname === "/run") {
      if (!env.RUN_TOKEN || url.searchParams.get("key") !== env.RUN_TOKEN) {
        return json({ ok: false, error: "unauthorized" }, 401);
      }
      try {
        const r = await runOnce(env);
        return json(r);
      } catch (e) {
        return json({ ok: false, error: errMsg(e) }, 500);
      }
    }

    return json({ ok: true, service: "decant-keeper", routes: ["/health", "/run?key="] });
  },
};
