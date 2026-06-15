"use client";

import { useEffect, useState } from "react";
import { useNetwork } from "@/lib/network";

type FundingEvent = {
  ts: number;
  mark: string;
  index: string;
};

function fmtPct(n: number, dp = 3) {
  const s = (n * 100).toFixed(dp);
  return n > 0 ? `+${s}%` : `${s}%`;
}

function timeAgo(ts: number) {
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function countdown(target?: number) {
  if (target === undefined) return "—";
  const s = target - Math.floor(Date.now() / 1000);
  if (s <= 0) return "due now";
  const m = Math.floor(s / 60);
  const sec = s % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}m ${sec.toString().padStart(2, "0")}s`;
}

async function fetchFunding(
  keeperApi: string,
  market: string,
): Promise<FundingEvent[] | null> {
  try {
    const r = await fetch(`${keeperApi}/funding?market=${market}&limit=8`);
    if (!r.ok) return null;
    const j = (await r.json()) as { ok?: boolean; funding?: FundingEvent[] };
    return j.ok && j.funding ? j.funding : null;
  } catch {
    return null;
  }
}

export function FundingPanel({
  marketKey,
  fundingRate,
  nextFundingTs,
  intervalSec,
}: {
  marketKey: string;
  fundingRate?: number;
  nextFundingTs?: number;
  intervalSec: number;
}) {
  const { network } = useNetwork();
  const [, setTick] = useState(0);
  const [history, setHistory] = useState<FundingEvent[] | null>(null);

  // Tick every second for the live countdown.
  useEffect(() => {
    const t = setInterval(() => setTick((v) => v + 1), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () =>
      fetchFunding(network.keeperApi, marketKey).then((f) => !cancelled && setHistory(f));
    run();
    const t = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [marketKey, network.keeperApi]);

  const intervalLabel = intervalSec % 3600 === 0 ? `${intervalSec / 3600}h` : `${Math.round(intervalSec / 60)}m`;
  const positive = (fundingRate ?? 0) >= 0;

  return (
    <div className="mb-6 rounded-xl border border-line bg-panel p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">Funding</p>
          <span className="text-[10px] text-ink-dim">every {intervalLabel}</span>
        </div>
        <div className="flex items-center gap-5">
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">Rate / {intervalLabel}</p>
            <p className={`font-mono text-sm ${positive ? "text-green" : "text-wine"}`}>
              {fundingRate === undefined ? "—" : fmtPct(fundingRate)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">Next funding</p>
            <p className="font-mono text-sm text-amber">{countdown(nextFundingTs)}</p>
          </div>
        </div>
      </div>

      <p className="mt-2 text-[11px] text-ink-dim">
        {positive
          ? "Longs pay shorts (mark above index)."
          : "Shorts pay longs (mark below index)."}
      </p>

      {history && history.length > 0 && (
        <div className="mt-3 border-t border-line-soft pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-dim">Recent funding</p>
          <div className="flex flex-wrap gap-x-5 gap-y-1.5">
            {history.map((f, i) => {
              const mk = Number(f.mark);
              const ix = Number(f.index);
              const rate = ix > 0 ? (mk - ix) / ix : 0;
              return (
                <span key={i} className="font-mono text-[11px]">
                  <span className="text-ink-dim">{timeAgo(f.ts)} </span>
                  <span className={rate >= 0 ? "text-green" : "text-wine"}>{fmtPct(rate)}</span>
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
