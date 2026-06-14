"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatUnits, type Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { perpMarketAbi, type MarketKey } from "@/lib/decant";
import { useNetwork } from "@/lib/network";

const CALLS_PER_MARKET = 4; // positions, unrealizedPnl, getMarkPrice, freeCollateral

type Row = {
  key: MarketKey;
  label: string;
  symbol: string;
  isLong: boolean;
  sizeAbs: number;
  notional: number;
  margin: number;
  entry: number;
  mark: number;
  uPnl: number;
  free: number;
};

function usd(n: number, dp = 2) {
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

function signed(n: number, dp = 2) {
  return `${n >= 0 ? "+" : "-"}$${usd(Math.abs(n), dp)}`;
}

async function fetchRealized(
  keeperApi: string,
  trader: string,
): Promise<{ realized: number; trades: number } | null> {
  try {
    const r = await fetch(`${keeperApi}/activity?trader=${trader}&limit=200`);
    const j = (await r.json()) as {
      ok: boolean;
      events?: { kind: string; pnl?: string }[];
    };
    if (!j.ok || !j.events) return null;
    let realized = 0;
    let trades = 0;
    for (const e of j.events) {
      if (e.kind === "PositionClosed" || e.kind === "Liquidated") {
        realized += Number(e.pnl ?? "0");
        trades++;
      }
    }
    return { realized, trades };
  } catch {
    return null;
  }
}

export function Portfolio() {
  const { address, isConnected } = useAccount();
  const { network } = useNetwork();
  const MARKETS = network.markets;
  const MARKET_KEYS = Object.keys(MARKETS) as MarketKey[];

  const { data, isLoading } = useReadContracts({
    allowFailure: true,
    contracts: address
      ? MARKET_KEYS.flatMap((k) => {
          const m = MARKETS[k]!;
          const base = {
            address: m.address,
            abi: perpMarketAbi as Abi,
            chainId: network.chainId,
          } as const;
          return [
            { ...base, functionName: "positions", args: [address] },
            { ...base, functionName: "unrealizedPnl", args: [address] },
            { ...base, functionName: "getMarkPrice" },
            { ...base, functionName: "freeCollateral", args: [address] },
          ];
        })
      : [],
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const [realized, setRealized] = useState<{ realized: number; trades: number } | null>(null);
  useEffect(() => {
    if (!(isConnected && address)) return;
    let cancelled = false;
    const run = () =>
      fetchRealized(network.keeperApi, address).then((r) => !cancelled && setRealized(r));
    run();
    const t = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isConnected, address, network.keeperApi]);

  if (!isConnected) {
    return (
      <div className="rounded-xl border border-line bg-panel p-8 text-center text-ink-soft">
        Connect a wallet to see your portfolio.
      </div>
    );
  }

  const rows: Row[] = [];
  let totalFree = 0;
  let totalMargin = 0;
  let totalUpnl = 0;
  if (data) {
    MARKET_KEYS.forEach((k, i) => {
      const off = i * CALLS_PER_MARKET;
      const posRes = data[off]?.result as readonly [bigint, bigint, bigint, bigint] | undefined;
      const pnlRes = data[off + 1]?.result as bigint | undefined;
      const markRes = data[off + 2]?.result as bigint | undefined;
      const freeRes = data[off + 3]?.result as bigint | undefined;
      const free = freeRes !== undefined ? Number(formatUnits(freeRes, 18)) : 0;
      totalFree += free;
      if (!posRes || posRes[0] === 0n) return;
      const sizeSigned = Number(formatUnits(posRes[0], 18));
      const sizeAbs = Math.abs(sizeSigned);
      const notional = Number(formatUnits(posRes[1], 18));
      const margin = Number(formatUnits(posRes[2], 18));
      const mark = markRes !== undefined ? Number(formatUnits(markRes, 18)) : 0;
      const uPnl = pnlRes !== undefined ? Number(formatUnits(pnlRes, 18)) : 0;
      totalMargin += margin;
      totalUpnl += uPnl;
      rows.push({
        key: k,
        label: MARKETS[k]!.label,
        symbol: MARKETS[k]!.symbol,
        isLong: sizeSigned > 0,
        sizeAbs,
        notional,
        margin,
        entry: sizeAbs > 0 ? notional / sizeAbs : 0,
        mark,
        uPnl,
        free,
      });
    });
  }
  const equity = totalFree + totalMargin + totalUpnl;

  return (
    <div className="space-y-5">
      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Card label="Account equity" value={`$${usd(equity)}`} accent="text-ink" />
        <Card label="Free collateral" value={`$${usd(totalFree)}`} accent="text-green" />
        <Card
          label="Open PnL"
          value={signed(totalUpnl)}
          accent={totalUpnl >= 0 ? "text-green" : "text-wine"}
        />
        <Card
          label="Realized PnL"
          value={realized ? signed(realized.realized) : "—"}
          accent={realized && realized.realized < 0 ? "text-wine" : "text-green"}
        />
      </div>

      {/* Open positions */}
      <div className="rounded-xl border border-line bg-panel p-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
            Open positions
          </h2>
          <span className="text-xs text-ink-dim">
            {realized ? `${realized.trades} closed trades` : ""}
          </span>
        </div>
        {isLoading && rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-dim">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-sm text-ink-dim">
            No open positions.{" "}
            <Link href="/trade" className="text-amber hover:opacity-80">
              Open one →
            </Link>
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wider text-ink-dim">
                  <th className="pb-2 font-medium">Market</th>
                  <th className="pb-2 font-medium">Side</th>
                  <th className="pb-2 text-right font-medium">Size</th>
                  <th className="pb-2 text-right font-medium">Notional</th>
                  <th className="pb-2 text-right font-medium">Entry</th>
                  <th className="pb-2 text-right font-medium">Mark</th>
                  <th className="pb-2 text-right font-medium">PnL</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {rows.map((r) => (
                  <tr key={r.key} className="border-t border-line-soft">
                    <td className="py-2.5">{r.label}</td>
                    <td className={`py-2.5 ${r.isLong ? "text-green" : "text-wine"}`}>
                      {r.isLong ? "Long" : "Short"}
                    </td>
                    <td className="py-2.5 text-right">
                      {r.sizeAbs.toLocaleString(undefined, { maximumFractionDigits: 4 })} {r.symbol}
                    </td>
                    <td className="py-2.5 text-right">${usd(r.notional)}</td>
                    <td className="py-2.5 text-right">${usd(r.entry)}</td>
                    <td className="py-2.5 text-right">${usd(r.mark)}</td>
                    <td className={`py-2.5 text-right ${r.uPnl >= 0 ? "text-green" : "text-wine"}`}>
                      {signed(r.uPnl)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Card({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-ink-dim">{label}</p>
      <p className={`font-mono text-lg ${accent}`}>{value}</p>
    </div>
  );
}
