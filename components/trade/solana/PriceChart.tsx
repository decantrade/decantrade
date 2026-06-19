"use client";

import { useEffect, useState } from "react";

type Pt = { t: number; c: number };
type CandlesResponse = { source: string; candles: number[][] };

// Lightweight SOL/USD sparkline (no chart lib). Data comes from the app's
// allow-listed /api/candles proxy (Coinbase → Binance fallback). The market
// index is keeper-pushed from the same Pyth SOL/USD feed, so this reflects the
// price the perp actually settles against.
export default function PriceChart() {
  const [pts, setPts] = useState<Pt[] | null>(null);
  const [err, setErr] = useState(false);

  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch("/api/candles?product=SOL-USD&granularity=3600");
        if (!res.ok) throw new Error("candles");
        const json = (await res.json()) as CandlesResponse;
        // candle = [time(s), low, high, open, close, volume]. Coinbase returns
        // newest-first, Binance oldest-first — sort ascending, keep last ~48h.
        const data = [...json.candles]
          .sort((a, b) => a[0] - b[0])
          .slice(-48)
          .map((k) => ({ t: k[0], c: k[4] }));
        if (alive) {
          setPts(data);
          setErr(false);
        }
      } catch {
        if (alive) setErr(true);
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  if (err || (pts && pts.length < 2)) return null;
  if (!pts) return <div className="chart skeleton" aria-hidden />;

  const W = 520;
  const H = 96;
  const pad = 4;
  const closes = pts.map((p) => p.c);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (pts.length - 1)) * (W - pad * 2);
  const y = (c: number) => pad + (1 - (c - min) / span) * (H - pad * 2);
  const line = pts.map((p, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)} ${y(p.c).toFixed(1)}`).join(" ");
  const area = `${line} L${x(pts.length - 1).toFixed(1)} ${H} L${x(0).toFixed(1)} ${H} Z`;
  const first = closes[0];
  const last = closes[closes.length - 1];
  const up = last >= first;
  const chg = ((last - first) / first) * 100;
  const stroke = up ? "var(--green)" : "var(--red)";

  return (
    <div className="chart">
      <div className="chart-head">
        <span className="chart-label">SOL / USD · 48h</span>
        <span className="chart-chg" style={{ color: stroke }}>
          {up ? "+" : ""}
          {chg.toFixed(2)}%
        </span>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="chart-svg">
        <defs>
          <linearGradient id="solChartFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={stroke} stopOpacity="0.18" />
            <stop offset="1" stopColor={stroke} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#solChartFill)" />
        <path d={line} fill="none" stroke={stroke} strokeWidth="1.6" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}
