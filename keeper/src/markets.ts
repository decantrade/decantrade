import type { DecantPublicClient } from "./clients.js";
import {
  config,
  perpMarketAbi,
  factoryAbi,
  oracleAbi,
  erc20SymbolAbi,
  type MarketCfg,
} from "./config.js";

// Mutable registry: starts as the static MARKETS list, then gets augmented with
// markets discovered on-chain from the permissionless factory. The indexer and
// keeper sweeps read getMarkets() each cycle so newly launched markets are
// picked up without a restart.
let activeMarkets: MarketCfg[] = config.markets.map((m) => ({ ...m, source: "static" as const }));

export function getMarkets(): MarketCfg[] {
  return activeMarkets;
}

function uniqueKey(base: string, taken: Set<string>, address: string): string {
  let key = base.toUpperCase().replace(/[^A-Z0-9]/g, "") || "MKT";
  if (taken.has(key)) key = `${key}-${address.slice(2, 6).toUpperCase()}`;
  return key;
}

/** Derive a human key for a launched market via oracle.baseToken().symbol(). */
async function deriveKey(
  client: DecantPublicClient,
  market: `0x${string}`,
  taken: Set<string>,
): Promise<string> {
  try {
    const oracle = (await client.readContract({
      address: market,
      abi: perpMarketAbi,
      functionName: "oracle",
    })) as `0x${string}`;
    const baseToken = (await client.readContract({
      address: oracle,
      abi: oracleAbi,
      functionName: "baseToken",
    })) as `0x${string}`;
    const symbol = (await client.readContract({
      address: baseToken,
      abi: erc20SymbolAbi,
      functionName: "symbol",
    })) as string;
    return uniqueKey(symbol, taken, market);
  } catch {
    // Pyth-priced markets have no baseToken(); fall back to an address-derived key.
    return uniqueKey(`MKT${market.slice(2, 6)}`, taken, market);
  }
}

/**
 * Read every market from the factory and merge any not already tracked into the
 * active registry. Returns the keys of newly discovered markets. No-op when
 * FACTORY_ADDRESS is unset.
 */
export async function refreshMarkets(client: DecantPublicClient): Promise<string[]> {
  const factory = config.factoryAddress;
  if (!factory) return [];

  let len: bigint;
  try {
    len = (await client.readContract({
      address: factory,
      abi: factoryAbi,
      functionName: "allMarketsLength",
    })) as bigint;
  } catch (e) {
    console.warn(`[discovery] allMarketsLength failed: ${e instanceof Error ? e.message.split("\n")[0] : e}`);
    return [];
  }

  const known = new Set(activeMarkets.map((m) => m.address.toLowerCase()));
  const takenKeys = new Set(activeMarkets.map((m) => m.key));
  const discovered: MarketCfg[] = [];

  for (let i = 0n; i < len; i++) {
    let addr: `0x${string}`;
    try {
      addr = (await client.readContract({
        address: factory,
        abi: factoryAbi,
        functionName: "allMarkets",
        args: [i],
      })) as `0x${string}`;
    } catch {
      continue;
    }
    if (known.has(addr.toLowerCase())) continue;
    const key = await deriveKey(client, addr, takenKeys);
    takenKeys.add(key);
    known.add(addr.toLowerCase());
    discovered.push({ key, address: addr, source: "factory" });
  }

  if (discovered.length > 0) {
    activeMarkets = [...activeMarkets, ...discovered];
    console.log(`[discovery] +${discovered.length} market(s): ${discovered.map((m) => `${m.key}=${m.address}`).join(", ")}`);
  }
  return discovered.map((m) => m.key);
}
