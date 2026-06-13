import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Coinbase candle: [time(s), low, high, open, close, volume]
type Candle = [number, number, number, number, number, number];

// Allow-list of supported products (avoids open proxy / SSRF).
const PRODUCTS: Record<string, { binance: string }> = {
  "ETH-USD": { binance: "ETHUSDT" },
  "BTC-USD": { binance: "BTCUSDT" },
  "SOL-USD": { binance: "SOLUSDT" },
};

// Synthetic markets: assets with no public exchange feed (e.g. pre-IPO names).
// SPCX tracks SpaceX pre-IPO; on testnet its index price is keeper-pushed, so we
// render a deterministic pseudo price series anchored at the seed price.
const SYNTHETIC: Record<string, { anchor: number }> = {
  "SPCX-USD": { anchor: 158.41 },
};

// Deterministic PRNG (mulberry32) so candles are stable across reloads.
function rng(seed: number): number {
  let t = (seed + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function synthCandles(anchor: number, granularity: number): Candle[] {
  const n = 300;
  const nowBucket = Math.floor(Date.now() / 1000 / granularity);
  const start = nowBucket - (n - 1);
  const vol = 0.012; // per-candle volatility
  const out: Candle[] = [];
  let price = anchor;
  for (let i = 0; i < n; i++) {
    const bucket = start + i;
    const open = price;
    const drift = (rng(bucket) - 0.5) * 2 * vol; // mean-reverting-ish walk
    // gentle pull back toward the anchor so it doesn't wander off forever
    const revert = (anchor - open) * 0.02;
    const close = Math.max(anchor * 0.5, open * (1 + drift) + revert);
    const hi = Math.max(open, close) * (1 + rng(bucket * 7 + 1) * vol);
    const lo = Math.min(open, close) * (1 - rng(bucket * 13 + 3) * vol);
    out.push([bucket * granularity, lo, hi, open, close, rng(bucket * 3 + 5) * 1000]);
    price = close;
  }
  return out;
}

const GRAN_TO_BINANCE: Record<number, string> = {
  3600: "1h",
  21600: "6h",
  86400: "1d",
};

async function fromCoinbase(product: string, granularity: number): Promise<Candle[]> {
  const res = await fetch(
    `https://api.exchange.coinbase.com/products/${product}/candles?granularity=${granularity}`,
    { headers: { "User-Agent": "decant-trade/1.0" }, signal: AbortSignal.timeout(6000) },
  );
  if (!res.ok) throw new Error(`coinbase ${res.status}`);
  const raw = (await res.json()) as Candle[];
  if (!Array.isArray(raw) || raw.length === 0) throw new Error("coinbase empty");
  return raw;
}

async function fromBinance(symbol: string, granularity: number): Promise<Candle[]> {
  const interval = GRAN_TO_BINANCE[granularity] ?? "1h";
  // Try a couple of Binance hosts; some regions block the primary.
  const hosts = ["https://api.binance.com", "https://data-api.binance.vision"];
  let lastErr: unknown;
  for (const host of hosts) {
    try {
      const res = await fetch(
        `${host}/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=300`,
        { signal: AbortSignal.timeout(6000) },
      );
      if (!res.ok) throw new Error(`binance ${res.status}`);
      const raw = (await res.json()) as (string | number)[][];
      // Binance kline: [openTime(ms), open, high, low, close, volume, ...]
      return raw.map((k) => [
        Math.floor(Number(k[0]) / 1000),
        Number(k[3]), // low
        Number(k[2]), // high
        Number(k[1]), // open
        Number(k[4]), // close
        Number(k[5]), // volume
      ]);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr ?? new Error("binance failed");
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const product = searchParams.get("product") ?? "ETH-USD";
  const granularity = Number(searchParams.get("granularity") ?? "3600");
  if (!GRAN_TO_BINANCE[granularity]) {
    return NextResponse.json({ error: "unsupported granularity" }, { status: 400 });
  }

  const synth = SYNTHETIC[product];
  if (synth) {
    return NextResponse.json(
      { source: "synthetic", candles: synthCandles(synth.anchor, granularity) },
      { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
    );
  }

  const meta = PRODUCTS[product];
  if (!meta) {
    return NextResponse.json({ error: "unsupported product" }, { status: 400 });
  }

  let candles: Candle[] | null = null;
  let source = "coinbase";
  try {
    candles = await fromCoinbase(product, granularity);
  } catch {
    try {
      candles = await fromBinance(meta.binance, granularity);
      source = "binance";
    } catch {
      candles = null;
    }
  }

  if (!candles) {
    return NextResponse.json({ error: "upstream unavailable" }, { status: 502 });
  }

  return NextResponse.json(
    { source, candles },
    {
      headers: {
        // Cache at the edge so we don't hammer upstreams per viewer.
        "cache-control": "public, s-maxage=60, stale-while-revalidate=300",
      },
    },
  );
}
