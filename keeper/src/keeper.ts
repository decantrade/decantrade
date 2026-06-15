import type { DecantPublicClient, DecantWalletClient, DecantAccount } from "./clients.js";
import { config, perpMarketAbi, type MarketCfg } from "./config.js";
import { getMarkets } from "./markets.js";
import { getOpenTraders } from "./db.js";

const maintenanceCache = new Map<string, bigint>();

async function maintenance(client: DecantPublicClient, market: MarketCfg): Promise<bigint> {
  const cached = maintenanceCache.get(market.key);
  if (cached !== undefined) return cached;
  const mmr = (await client.readContract({
    address: market.address,
    abi: perpMarketAbi,
    functionName: "maintenanceMarginRatio",
  })) as bigint;
  maintenanceCache.set(market.key, mmr);
  return mmr;
}

function fmtRatio(wad: bigint): string {
  return `${(Number(wad) / 1e18 * 100).toFixed(2)}%`;
}

/** One liquidation sweep across all markets. Returns number of liquidations sent. */
export async function liquidationSweep(
  client: DecantPublicClient,
  wallet: DecantWalletClient | null,
  account: DecantAccount | null,
): Promise<number> {
  let sent = 0;
  for (const market of getMarkets()) {
    const traders = getOpenTraders(market.key);
    if (traders.length === 0) continue;
    const mmr = await maintenance(client, market);
    for (const trader of traders) {
      let ratio: bigint;
      try {
        ratio = (await client.readContract({
          address: market.address,
          abi: perpMarketAbi,
          functionName: "marginRatio",
          args: [trader as `0x${string}`],
        })) as bigint;
      } catch {
        continue;
      }
      if (ratio >= mmr) continue; // healthy
      console.log(
        `[keeper] ${market.key} ${trader} marginRatio=${fmtRatio(ratio)} < mmr=${fmtRatio(mmr)} → LIQUIDATE`,
      );
      if (!wallet || !account) {
        console.log(`[keeper] (dry-run: no KEEPER_PRIVATE_KEY set, skipping tx)`);
        continue;
      }
      try {
        const hash = await wallet.writeContract({
          account,
          chain: config.chain,
          address: market.address,
          abi: perpMarketAbi,
          functionName: "liquidate",
          args: [trader as `0x${string}`],
        });
        await client.waitForTransactionReceipt({ hash });
        console.log(`[keeper] liquidated ${trader} on ${market.key} — tx ${hash}`);
        sent++;
      } catch (e) {
        const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
        console.warn(`[keeper] liquidate ${trader} on ${market.key} failed: ${msg}`);
      }
    }
  }
  return sent;
}

/** Accrue funding on each market (anyone can call settleFunding). */
export async function fundingSweep(
  client: DecantPublicClient,
  wallet: DecantWalletClient | null,
  account: DecantAccount | null,
): Promise<number> {
  if (!wallet || !account) return 0;
  let sent = 0;
  for (const market of getMarkets()) {
    try {
      const hash = await wallet.writeContract({
        account,
        chain: config.chain,
        address: market.address,
        abi: perpMarketAbi,
        functionName: "settleFunding",
      });
      await client.waitForTransactionReceipt({ hash });
      console.log(`[keeper] funding settled on ${market.key} — tx ${hash}`);
      sent++;
    } catch (e) {
      const msg = e instanceof Error ? e.message.split("\n")[0] : String(e);
      console.warn(`[keeper] settleFunding ${market.key} failed: ${msg}`);
    }
  }
  return sent;
}
