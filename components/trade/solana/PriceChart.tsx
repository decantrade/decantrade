"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  CandlestickSeries,
  ColorType,
  CrosshairMode,
  createChart,
  HistogramSeries,
  LineStyle,
  type AreaData,
  type CandlestickData,
  type HistogramData,
  type IChartApi,
  type ISeriesApi,
  type UTCTimestamp,
} from "lightweight-charts";

type CoinbaseCandle = [number, number, number, number, number, number]; // [time, low, high, open, close, volume]
type Candle = { time: UTCTimestamp; open: number; high: number; low: number; close: number; volume: number };

const TIMEFRAMES = [
  { label: "1H", granularity: 3600 },
  { label: "6H", granularity: 21600 },
  { label: "1D", granularity: 86400 },
] as const;

const COLORS = {
  bg: "transparent",
  grid: "rgba(255,255,255,0.05)",
  ink: "#ece4d6",
  inkDim: "#8a8073",
  up: "#6fcf97",
  down: "#c2566a",
  amber: "#e8b84b",
  volUp: "rgba(111,207,151,0.4)",
  volDown: "rgba(194,86,106,0.4)",
};

const fmtUsd = (n: number) =>
  `$${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const fmtCompact = (n: number) =>
  n >= 1e9
    ? `${(n / 1e9).toFixed(2)}B`
    : n >= 1e6
      ? `${(n / 1e6).toFixed(2)}M`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1)}K`
        : n.toFixed(0);

async function fetchCandles(granularity: number): Promise<Candle[]> {
  const res = await fetch(`/api/candles?product=SOL-USD&granularity=${granularity}`);
  if (!res.ok) throw new Error(`candles ${res.status}`);
  const { candles: raw } = (await res.json()) as { candles: CoinbaseCandle[] };
  return raw
    .map(([time, low, high, open, close, volume]) => ({
      time: time as UTCTimestamp,
      open,
      high,
      low,
      close,
      volume,
    }))
    .sort((a, b) => (a.time as number) - (b.time as number));
}

type Stats24 = { last: number; chg: number; high: number; low: number; vol: number };

// 24h rollup from hourly candles (independent of the chart timeframe so the
// header/stats stay consistent when switching 1H/6H/1D).
function rollup24h(hourly: Candle[]): Stats24 | null {
  if (hourly.length < 2) return null;
  const window = hourly.slice(-24);
  const last = window[window.length - 1].close;
  const first = window[0].open;
  return {
    last,
    chg: ((last - first) / first) * 100,
    high: Math.max(...window.map((c) => c.high)),
    low: Math.min(...window.map((c) => c.low)),
    vol: window.reduce((s, c) => s + c.volume, 0),
  };
}

// SOL/USD candlestick chart (TradingView lightweight-charts) with a volume
// histogram and a 24h stats strip. The market index is keeper-pushed from the
// same Pyth SOL/USD feed, so this reflects the price the perp actually settles
// against. Data via the allow-listed /api/candles proxy (Coinbase → Binance).
export default function PriceChart() {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const areaRef = useRef<ISeriesApi<"Area"> | null>(null);
  const volRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const [granularity, setGranularity] = useState<number>(3600);
  const [mode, setMode] = useState<"candles" | "area">("candles");
  const [status, setStatus] = useState<"loading" | "ready" | "error">("loading");
  const [stats, setStats] = useState<Stats24 | null>(null);

  // Create the chart once.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const chart = createChart(el, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: COLORS.bg },
        textColor: COLORS.inkDim,
        fontFamily: "var(--font-mono, ui-monospace, monospace)",
        fontSize: 11,
      },
      grid: {
        vertLines: { color: COLORS.grid },
        horzLines: { color: COLORS.grid },
      },
      rightPriceScale: { borderColor: COLORS.grid, scaleMargins: { top: 0.08, bottom: 0.26 } },
      timeScale: { borderColor: COLORS.grid, timeVisible: true, secondsVisible: false },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: { color: COLORS.inkDim, width: 1, style: LineStyle.Dashed, labelBackgroundColor: COLORS.amber },
        horzLine: { color: COLORS.inkDim, width: 1, style: LineStyle.Dashed, labelBackgroundColor: COLORS.amber },
      },
    });
    const candle = chart.addSeries(CandlestickSeries, {
      upColor: COLORS.up,
      downColor: COLORS.down,
      borderUpColor: COLORS.up,
      borderDownColor: COLORS.down,
      wickUpColor: COLORS.up,
      wickDownColor: COLORS.down,
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
    });
    const area = chart.addSeries(AreaSeries, {
      lineColor: COLORS.amber,
      lineWidth: 2,
      topColor: "rgba(232,184,75,0.22)",
      bottomColor: "rgba(232,184,75,0)",
      priceFormat: { type: "price", precision: 2, minMove: 0.01 },
      visible: false,
    });
    const vol = chart.addSeries(HistogramSeries, {
      priceFormat: { type: "volume" },
      priceScaleId: "vol",
    });
    // Pin the volume histogram to the bottom ~22% of the pane.
    vol.priceScale().applyOptions({ scaleMargins: { top: 0.78, bottom: 0 } });
    chartRef.current = chart;
    candleRef.current = candle;
    areaRef.current = area;
    volRef.current = vol;
    return () => {
      chart.remove();
      chartRef.current = null;
      candleRef.current = null;
      areaRef.current = null;
      volRef.current = null;
    };
  }, []);

  // Toggle series visibility on mode change.
  useEffect(() => {
    candleRef.current?.applyOptions({ visible: mode === "candles" });
    areaRef.current?.applyOptions({ visible: mode === "area" });
  }, [mode]);

  // Load chart data whenever the timeframe changes; refresh periodically.
  useEffect(() => {
    let cancelled = false;
    const load = (initial: boolean) => {
      if (initial) setStatus("loading");
      fetchCandles(granularity)
        .then((data) => {
          if (cancelled || !candleRef.current || !areaRef.current || !volRef.current) return;
          candleRef.current.setData(
            data.map(({ time, open, high, low, close }) => ({ time, open, high, low, close })) as CandlestickData[],
          );
          areaRef.current.setData(data.map((d) => ({ time: d.time, value: d.close })) as AreaData[]);
          volRef.current.setData(
            data.map((d) => ({
              time: d.time,
              value: d.volume,
              color: d.close >= d.open ? COLORS.volUp : COLORS.volDown,
            })) as HistogramData[],
          );
          if (initial) chartRef.current?.timeScale().fitContent();
          setStatus("ready");
        })
        .catch(() => {
          if (!cancelled) setStatus("error");
        });
    };
    load(true);
    const id = setInterval(() => load(false), 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [granularity]);

  // 24h stats from hourly candles, independent of the selected timeframe.
  useEffect(() => {
    let cancelled = false;
    const load = () => {
      fetchCandles(3600)
        .then((data) => {
          if (cancelled) return;
          const s = rollup24h(data);
          if (s) setStats(s);
        })
        .catch(() => {});
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const up = (stats?.chg ?? 0) >= 0;

  return (
    <div className="chart2">
      <div className="chart2-head">
        <div className="chart2-title">
          <span className="chart2-pair">SOL / USD</span>
          {stats && (
            <>
              <span className="chart2-last">{fmtUsd(stats.last)}</span>
              <span className="chart2-chg" style={{ color: up ? COLORS.up : COLORS.down }}>
                {up ? "▲ +" : "▼ "}
                {stats.chg.toFixed(2)}%
              </span>
            </>
          )}
        </div>
        <div className="chart2-tools">
          <div className="chart2-seg">
            <button
              type="button"
              className={mode === "candles" ? "on" : ""}
              onClick={() => setMode("candles")}
              aria-label="Candlestick view"
            >
              Candles
            </button>
            <button
              type="button"
              className={mode === "area" ? "on" : ""}
              onClick={() => setMode("area")}
              aria-label="Area view"
            >
              Area
            </button>
          </div>
          <div className="chart2-seg">
            {TIMEFRAMES.map((tf) => (
              <button
                key={tf.label}
                type="button"
                className={granularity === tf.granularity ? "on" : ""}
                onClick={() => setGranularity(tf.granularity)}
              >
                {tf.label}
              </button>
            ))}
          </div>
        </div>
      </div>
      {stats && (
        <div className="chart2-stats">
          <span>
            <i>24h change</i>
            <b style={{ color: up ? COLORS.up : COLORS.down }}>
              {up ? "+" : ""}
              {stats.chg.toFixed(2)}%
            </b>
          </span>
          <span>
            <i>24h high</i>
            <b>{fmtUsd(stats.high)}</b>
          </span>
          <span>
            <i>24h low</i>
            <b>{fmtUsd(stats.low)}</b>
          </span>
          <span>
            <i>24h vol</i>
            <b>{fmtCompact(stats.vol)} SOL</b>
          </span>
        </div>
      )}
      <div className="chart2-body">
        <div ref={containerRef} className="chart2-canvas" />
        {status !== "ready" && (
          <div className="chart2-overlay">
            {status === "error" ? "chart unavailable" : "loading chart…"}
          </div>
        )}
      </div>
    </div>
  );
}
