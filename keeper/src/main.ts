import { config } from "./config.js";
import { account, publicClient, wallet } from "./clients.js";
import { syncAll } from "./indexer.js";
import { fundingSweep, liquidationSweep } from "./keeper.js";
import { startApi } from "./api.js";

async function main() {
  console.log(`[main] chain ${config.chainId} rpc ${config.rpcUrl}`);
  console.log(`[main] markets: ${config.markets.map((m) => `${m.key}=${m.address}`).join(", ")}`);
  console.log(`[main] keeper account: ${account ? account.address : "(none — indexer/dry-run only)"}`);

  // Initial backfill.
  await syncAll(publicClient);

  // ONCE mode: backfill + a single liquidation sweep, then exit (handy for scripted checks).
  if (process.env.ONCE === "1") {
    const n = await liquidationSweep(publicClient, wallet, account);
    console.log(`[main] once mode done — ${n} liquidation(s) sent`);
    process.exit(0);
  }

  startApi();

  // Indexer poll loop.
  const indexerTimer = setInterval(() => {
    syncAll(publicClient).catch((e) => console.warn("[indexer] sync error:", e?.message || e));
  }, config.pollIntervalMs);

  // Liquidation sweep loop (runs every poll interval, after a fresh sync).
  const liqTimer = setInterval(() => {
    liquidationSweep(publicClient, wallet, account).catch((e) =>
      console.warn("[keeper] liquidation error:", e?.message || e),
    );
  }, config.pollIntervalMs);

  // Funding sweep loop (slower cadence).
  const fundingTimer = setInterval(() => {
    fundingSweep(publicClient, wallet, account).catch((e) =>
      console.warn("[keeper] funding error:", e?.message || e),
    );
  }, config.fundingIntervalMs);

  // Run one liquidation sweep immediately after the initial backfill.
  await liquidationSweep(publicClient, wallet, account);

  const shutdown = () => {
    clearInterval(indexerTimer);
    clearInterval(liqTimer);
    clearInterval(fundingTimer);
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error("[main] fatal:", e);
  process.exit(1);
});
