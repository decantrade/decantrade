/**
 * Decant Solana keeper — Cloudflare Cron Worker.
 *
 * On a schedule (see wrangler.jsonc `triggers.crons`, every minute) it:
 *   1. fetches the real SOL/USD price from Pyth (Hermes) off-chain and pushes
 *      it to the market index via `push_price` (signer = market oracle_authority),
 *   2. scans open positions and `liquidate`s any whose equity (margin + PnL) has
 *      fallen to/below the maintenance-margin requirement.
 *
 * Confirmations are done by polling getSignatureStatuses over HTTP (no websocket
 * in the Workers runtime). With no KEEPER_SECRET_KEY the worker is a dry run.
 */
import { AnchorProvider, Program, BN, Wallet } from "@coral-xyz/anchor";
import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
} from "@solana/web3.js";
import idlJson from "./idl.json";
import type { DecantSolana } from "./idlType";

export interface Env {
  SOLANA_RPC_URL?: string;
  KEEPER_SECRET_KEY?: string;
  MARKET_ID?: string;
  RUN_TOKEN?: string;
}

// Pyth SOL/USD price feed id (Hermes; real SOL/USD).
const SOL_USD_FEED =
  "ef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d";
const HERMES = `https://hermes.pyth.network/v2/updates/price/latest?ids[]=${SOL_USD_FEED}`;
const USDC = 1_000_000;
const FALLBACK_RPC = "https://api.devnet.solana.com";
const seed = (s: string): Uint8Array => new TextEncoder().encode(s);

async function fetchSolUsd1e6(): Promise<number> {
  const res = await fetch(HERMES);
  if (!res.ok) throw new Error(`hermes ${res.status}`);
  const j = (await res.json()) as { parsed: { price: { price: string; expo: number } }[] };
  const p = j.parsed[0].price;
  const price = Number(p.price) * Math.pow(10, p.expo);
  return Math.round(price * USDC);
}

function loadKeypair(env: Env): Keypair | null {
  if (!env.KEEPER_SECRET_KEY) return null;
  const arr = JSON.parse(env.KEEPER_SECRET_KEY) as number[];
  return Keypair.fromSecretKey(Uint8Array.from(arr));
}

async function sendAndPoll(
  connection: Connection,
  kp: Keypair,
  tx: Transaction,
): Promise<string> {
  const latest = await connection.getLatestBlockhash("confirmed");
  tx.feePayer = kp.publicKey;
  tx.recentBlockhash = latest.blockhash;
  tx.sign(kp);
  const sig = await connection.sendRawTransaction(tx.serialize(), {
    skipPreflight: false,
    maxRetries: 5,
  });
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    const { value } = await connection.getSignatureStatuses([sig]);
    const st = value[0];
    if (st) {
      if (st.err) throw new Error("tx failed on-chain");
      if (st.confirmationStatus === "confirmed" || st.confirmationStatus === "finalized")
        return sig;
    }
    await new Promise((r) => setTimeout(r, 1200));
  }
  throw new Error("not confirmed in 45s");
}

function pdas(programId: PublicKey, market: PublicKey, owner: PublicKey) {
  const bal = PublicKey.findProgramAddressSync(
    [seed("bal"), market.toBuffer(), owner.toBuffer()],
    programId,
  )[0];
  const pos = PublicKey.findProgramAddressSync(
    [seed("pos"), market.toBuffer(), owner.toBuffer()],
    programId,
  )[0];
  return { bal, pos };
}

type RunResult = { ok: boolean; pushed?: string; price?: number; liquidations: string[]; error?: string };

async function runOnce(env: Env): Promise<RunResult> {
  const rpc = env.SOLANA_RPC_URL || FALLBACK_RPC;
  const connection = new Connection(rpc, "confirmed");
  const kp = loadKeypair(env);
  const liquidations: string[] = [];

  // Readonly provider for fetching/decoding accounts.
  const dummy = {
    publicKey: PublicKey.default,
    signTransaction: async (t: Transaction) => t,
    signAllTransactions: async (t: Transaction[]) => t,
  };
  const provider = new AnchorProvider(connection, dummy as unknown as Wallet, {
    commitment: "confirmed",
  });
  const program = new Program<DecantSolana>(idlJson as DecantSolana, provider);
  const programId = program.programId;

  const marketIdLe = new Uint8Array(8);
  new DataView(marketIdLe.buffer).setBigUint64(0, BigInt(env.MARKET_ID ?? "1"), true);
  const market = PublicKey.findProgramAddressSync(
    [seed("market"), marketIdLe],
    programId,
  )[0];

  // 1) push price
  const price = await fetchSolUsd1e6();
  let pushed: string | undefined;
  if (kp) {
    const tx = await program.methods
      .pushPrice(new BN(price))
      .accounts({ oracleAuthority: kp.publicKey, market })
      .transaction();
    pushed = await sendAndPoll(connection, kp, tx);
  }

  // 2) liquidation scan (uses the freshly pushed index)
  const mkt = await program.account.market.fetch(market);
  const index = (mkt.indexPrice as BN).toNumber();
  const mmBps = mkt.maintenanceMarginBps as number;
  const positions = await program.account.position.all();
  for (const { account } of positions) {
    const p = account as unknown as {
      market: PublicKey;
      owner: PublicKey;
      sizeUsd: BN;
      entryPrice: BN;
      margin: BN;
    };
    if (p.market.toBase58() !== market.toBase58()) continue;
    const size = p.sizeUsd.toNumber();
    if (size === 0) continue;
    const entry = p.entryPrice.toNumber();
    const pnl = (size * (index - entry)) / entry;
    const equity = p.margin.toNumber() + pnl;
    const maintenance = (Math.abs(size) * mmBps) / 10000;
    if (equity <= maintenance && kp) {
      const { bal, pos } = pdas(programId, market, p.owner);
      try {
        const tx = await program.methods
          .liquidate()
          .accountsPartial({ liquidator: kp.publicKey, market, position: pos, userBalance: bal })
          .transaction();
        const sig = await sendAndPoll(connection, kp, tx);
        liquidations.push(`${p.owner.toBase58()}:${sig}`);
      } catch (e) {
        liquidations.push(`${p.owner.toBase58()}:FAILED:${(e as Error).message}`);
      }
    }
  }

  return { ok: true, pushed, price: price / USDC, liquidations };
}

export default {
  async scheduled(_event: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(
      runOnce(env).then(
        (r) => console.log("keeper run", JSON.stringify(r)),
        (e) => console.error("keeper run failed", (e as Error).message),
      ),
    );
  },

  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname === "/run") {
      if (env.RUN_TOKEN && url.searchParams.get("token") !== env.RUN_TOKEN) {
        return new Response("forbidden", { status: 403 });
      }
      try {
        const r = await runOnce(env);
        return Response.json(r);
      } catch (e) {
        return Response.json({ ok: false, error: (e as Error).message }, { status: 500 });
      }
    }
    return new Response("decant-keeper-sol: POST cron or GET /run?token=", {
      headers: { "content-type": "text/plain" },
    });
  },
};
