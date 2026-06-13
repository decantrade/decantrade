import type { AbiEvent } from "viem";
import type { DecantPublicClient } from "./clients.js";
import { config, perpMarketAbi, type MarketCfg } from "./config.js";
import { insertEvent, markClosed, markOpen, getCursor, setCursor } from "./db.js";

const EVENT_ABIS = perpMarketAbi.filter((x) => x.type === "event") as AbiEvent[];

// Cache block number -> timestamp to avoid refetching the same block.
const tsCache = new Map<string, number>();

async function blockTs(client: DecantPublicClient, blockNumber: bigint): Promise<number> {
  const key = blockNumber.toString();
  const cached = tsCache.get(key);
  if (cached !== undefined) return cached;
  const block = await client.getBlock({ blockNumber });
  const ts = Number(block.timestamp);
  tsCache.set(key, ts);
  return ts;
}

// JSON.stringify replacer that serializes bigints as decimal strings.
function jsonArgs(args: Record<string, unknown>): string {
  return JSON.stringify(args, (_k, v) => (typeof v === "bigint" ? v.toString() : v));
}

async function indexRange(
  client: DecantPublicClient,
  market: MarketCfg,
  fromBlock: bigint,
  toBlock: bigint,
): Promise<number> {
  const logs = await client.getLogs({
    address: market.address,
    events: EVENT_ABIS,
    fromBlock,
    toBlock,
  });
  let inserted = 0;
  for (const log of logs) {
    // eventName/args are present because we passed `events`.
    const eventName = (log as { eventName?: string }).eventName;
    const args = ((log as { args?: Record<string, unknown> }).args ?? {}) as Record<string, unknown>;
    if (!eventName || log.blockNumber == null) continue;
    const trader = typeof args.trader === "string" ? (args.trader as string) : null;
    const ts = await blockTs(client, log.blockNumber);
    const wrote = insertEvent({
      market: market.key,
      market_addr: market.address,
      kind: eventName,
      trader,
      block: Number(log.blockNumber),
      tx_hash: log.transactionHash!,
      log_index: log.logIndex!,
      ts,
      data: jsonArgs(args),
    });
    if (wrote) inserted++;

    // Maintain the open-position watch list.
    if (eventName === "PositionOpened" && trader) {
      markOpen({
        market: market.key,
        trader,
        is_long: args.isLong ? 1 : 0,
        size: String(args.size),
        notional: String(args.notional),
        block: Number(log.blockNumber),
      });
    } else if ((eventName === "PositionClosed" || eventName === "Liquidated") && trader) {
      markClosed(market.key, trader);
    }
  }
  return inserted;
}

export async function syncMarket(client: DecantPublicClient, market: MarketCfg, latest: bigint) {
  const cursor = getCursor(market.key) ?? config.startBlock;
  if (cursor > latest) return;
  let total = 0;
  for (let from = cursor; from <= latest; from += config.logChunk) {
    const to = from + config.logChunk - 1n > latest ? latest : from + config.logChunk - 1n;
    total += await indexRange(client, market, from, to);
    setCursor(market.key, to);
  }
  if (total > 0) {
    console.log(`[indexer] ${market.key}: +${total} events (synced to block ${latest})`);
  }
}

export async function syncAll(client: DecantPublicClient) {
  const latest = await client.getBlockNumber();
  for (const market of config.markets) {
    await syncMarket(client, market, latest);
  }
}
