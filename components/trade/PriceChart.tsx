"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type CandlestickData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";
import { MARKETS, type MarketKey } from "@/lib/decant";

// Coinbase Exchange product ids for each market (public, no key, CORS-enabled).
const PRODUCT: Record<MarketKey, string> = {
  ETH: "ETH-USD",
  BTC: "BTC-USD",
  SOL: "SOL-USD",
};

const TIMEFRAMES = [
  { label: "1H", granularity: 3600 },
  { label: "6H", granularity: 21600 },
  { label: "1D", granularity: 86400 },
] as const;

const COLORS = {
  bg: "#141110",
  line: "#2a241f",
  ink: "#ede6da",
  inkDim: "#7c7264",
  up: "#6fcf97",
  down: "#c2566a",
};

type CoinbaseCandle = [number, number, number, number, number, number]; // [time, low, high, open, close, volume]

async function fetchCandles(product: string, granularity: number): Promise<CandlestickData[]> {
  // Fetched via our own edge route (server-side) so it works from regions where
  // Coinbase's public API is geo-blocked; the route falls back to Binance.
  const res = await fetch(`/api/candles?product=${product}&granularity=${granularity}`);
  if (!res.ok) throw new Error(`candles ${res.status}`);
  const { candles: raw } = (await res.json()) as { candles: CoinbaseCandle[] };
  return raw
    .map(([time, low, high, open, close]) => ({
      time: time as UTCTimestamp,
      open,
      high,
      low,
      close,
    }))
    .sort((a, b) => (a.time as number) - (b.time as number));
}

export function PriceChart({ marketKey }: { marketKey: MarketKey }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const [granularity, setGranularity] = useState<number>(3600);
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  const [errored, setErrored] = useState(false);
  const dataKey = `${marketKey}-${granularity}`;
  const status: "loading" | "ready" | "error" = errored
    ? "error"
    : loadedKey === dataKey
      ? "ready"
      : "loading";

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.inkDim,
        fontFamily: "var(--font-mono, monospace)",
      },
      grid: {
        vertLines: { color: COLORS.line },
        horzLines: { color: COLORS.line },
      },
      rightPriceScale: { borderColor: COLORS.line },
      timeScale: { borderColor: COLORS.line, timeVisible: true },
      crosshair: { vertLine: { color: COLORS.inkDim }, horzLine: { color: COLORS.inkDim } },
    });
    const series = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
    });
    chartRef.current = chart;
    seriesRef.current = series;
    return () => {
      chart.remove();
      chartRef.current = null;
      seriesRef.current = null;
    };
  }, []);

  // Load data whenever market or timeframe changes.
  useEffect(() => {
    let cancelled = false;
    fetchCandles(PRODUCT[marketKey], granularity)
      .then((data) => {
        if (cancelled || !seriesRef.current) return;
        seriesRef.current.setData(data);
        chartRef.current?.timeScale().fitContent();
        setErrored(false);
        setLoadedKey(`${marketKey}-${granularity}`);
      })
      .catch(() => {
        if (!cancelled) setErrored(true);
      });
    return () => {
      cancelled = true;
    };
  }, [marketKey, granularity]);

  return (
    <div className="mb-6 rounded-xl border border-line bg-panel p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
          {MARKETS[marketKey].label} · price
        </h2>
        <div className="flex gap-1">
          {TIMEFRAMES.map((tf) => (
            <button
              key={tf.label}
              onClick={() => setGranularity(tf.granularity)}
              className={`rounded-md border px-2.5 py-1 text-xs font-medium transition ${
                granularity === tf.granularity
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-line text-ink-dim hover:border-ink-dim"
              }`}
            >
              {tf.label}
            </button>
          ))}
        </div>
      </div>
      <div className="relative">
        <div ref={containerRef} className="h-[280px] w-full" />
        {status !== "ready" && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-ink-dim">
            {status === "loading" ? "Loading chart…" : "Chart unavailable"}
          </div>
        )}
      </div>
      <p className="mt-2 text-right text-[10px] uppercase tracking-[0.18em] text-ink-dim">
        Spot reference · Coinbase / Binance
      </p>
    </div>
  );
}
