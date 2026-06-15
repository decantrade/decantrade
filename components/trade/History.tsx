"use client";

import { useEffect, useState } from "react";
import { formatUnits, type Abi } from "viem";
import { useAccount, useReadContracts } from "wagmi";
import { perpMarketAbi, type MarketKey } from "@/lib/decant";
import { useNetwork } from "@/lib/network";

type Tab = "activity" | "positions" | "leaderboard";

type ActivityEvent = {
  kind: string;
  market: string;
  trader: string;
  block: number;
  ts: number;
  tx: string;
  logIndex: number;
  side?: "long" | "short";
  size?: string;
  notional?: string;
  margin?: string;
  amount?: string;
  pnl?: string;
  reward?: string;
};

type LeaderRow = {
  trader: string;
  realizedPnl: string;
  volume: string;
  trades: number;
  liquidations: number;
};

function short(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function timeAgo(ts: number) {
  if (!ts) return "—";
  const s = Math.max(0, Math.floor(Date.now() / 1000) - ts);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function num(s?: string, dp = 2) {
  if (s === undefined) return "—";
  const n = Number(s);
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

const KIND_LABEL: Record<string, string> = {
  Deposited: "Deposit",
  Withdrawn: "Withdraw",
  PositionOpened: "Open",
  PositionClosed: "Close",
  Liquidated: "Liquidated",
};

// Module-level fetchers (no setState) so effects can `.then(setState)` — keeps
// state updates out of the synchronous effect body (react-hooks/set-state-in-effect).
async function fetchActivity(keeperApi: string, trader: string): Promise<ActivityEvent[]> {
  const r = await fetch(`${keeperApi}/activity?trader=${trader}&limit=50`);
  const j = (await r.json()) as { ok: boolean; events?: ActivityEvent[] };
  return j.events ?? [];
}

async function fetchLeaderboard(keeperApi: string, sort: string): Promise<LeaderRow[]> {
  const r = await fetch(`${keeperApi}/leaderboard?sort=${sort}&limit=25`);
  const j = (await r.json()) as { ok: boolean; leaderboard?: LeaderRow[] };
  return j.leaderboard ?? [];
}

export function History() {
  const { address, isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("activity");

  return (
    <section className="mt-8">
      <div className="mb-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-ink-soft">
          History
        </h2>
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
          {(
            [
              ["activity", "Your activity"],
              ["positions", "Positions"],
              ["leaderboard", "Leaderboard"],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`shrink-0 rounded-lg border px-3 py-1.5 text-xs font-medium transition ${
                tab === id
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-line text-ink-soft hover:border-ink-dim"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-line bg-panel p-5">
        {tab === "activity" && (
          <Activity key={address ?? "none"} address={address} isConnected={isConnected} />
        )}
        {tab === "positions" && <Positions address={address} isConnected={isConnected} />}
        {tab === "leaderboard" && <Leaderboard address={address} />}
      </div>
    </section>
  );
}

function Empty({
  title,
  children,
  action,
}: {
  title?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 py-8 text-center">
      {title && <p className="text-sm font-medium text-ink-soft">{title}</p>}
      <p className="max-w-xs text-xs leading-relaxed text-ink-dim">{children}</p>
      {action}
    </div>
  );
}

function Activity({ address, isConnected }: { address?: string; isConnected: boolean }) {
  const { network } = useNetwork();
  const [rows, setRows] = useState<ActivityEvent[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!(isConnected && address)) return;
    let cancelled = false;
    const run = () =>
      fetchActivity(network.keeperApi, address)
        .then((evs) => {
          if (cancelled) return;
          setRows(evs);
          setErr(null);
        })
        .catch(() => {
          if (cancelled) return;
          setErr("Couldn’t load activity. Try again shortly.");
          setRows([]);
        });
    run();
    const t = setInterval(run, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [isConnected, address, network.keeperApi]);

  if (!isConnected)
    return (
      <Empty title="No trade history yet">
        Connect your wallet to see your fills, funding payments and realized PnL here.
      </Empty>
    );
  if (err) return <Empty>{err}</Empty>;
  if (rows === null) return <Empty>Loading…</Empty>;
  if (rows.length === 0)
    return (
      <Empty title="No activity yet">
        Deposit USDC and open a long or short — your fills and funding will show up here.
      </Empty>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            <th className="py-2 pr-3 font-medium">Time</th>
            <th className="py-2 pr-3 font-medium">Action</th>
            <th className="py-2 pr-3 font-medium">Market</th>
            <th className="py-2 pr-3 font-medium">Detail</th>
            <th className="py-2 pl-3 text-right font-medium">Tx</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((e) => (
            <tr key={`${e.tx}:${e.logIndex}`} className="border-b border-line-soft last:border-0">
              <td className="py-2.5 pr-3 text-ink-dim">{timeAgo(e.ts)}</td>
              <td className="py-2.5 pr-3">
                <ActionBadge e={e} />
              </td>
              <td className="py-2.5 pr-3 font-mono text-ink-soft">{e.market}</td>
              <td className="py-2.5 pr-3 font-mono text-ink-soft">
                <Detail e={e} unit={network.collateralLabel} />
              </td>
              <td className="py-2.5 pl-3 text-right">
                {e.tx ? (
                  <a
                    href={`${network.explorer}/tx/${e.tx}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-xs text-amber hover:opacity-80"
                  >
                    {e.tx.slice(0, 8)}↗
                  </a>
                ) : (
                  "—"
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ActionBadge({ e }: { e: ActivityEvent }) {
  const label = KIND_LABEL[e.kind] ?? e.kind;
  let cls = "text-ink-soft";
  if (e.kind === "PositionOpened") cls = e.side === "long" ? "text-green" : "text-wine";
  else if (e.kind === "Liquidated") cls = "text-wine";
  else if (e.kind === "PositionClosed")
    cls = e.pnl && Number(e.pnl) >= 0 ? "text-green" : "text-wine";
  return (
    <span className={`font-medium ${cls}`}>
      {label}
      {e.kind === "PositionOpened" && e.side ? ` ${e.side}` : ""}
    </span>
  );
}

function Detail({ e, unit }: { e: ActivityEvent; unit: string }) {
  switch (e.kind) {
    case "Deposited":
    case "Withdrawn":
      return <>${num(e.amount)} {unit}</>;
    case "PositionOpened":
      return (
        <>
          {num(e.size, 4)} {e.market} · ${num(e.notional)} notional
        </>
      );
    case "PositionClosed":
      return (
        <span className={e.pnl && Number(e.pnl) >= 0 ? "text-green" : "text-wine"}>
          PnL {e.pnl && Number(e.pnl) >= 0 ? "+" : ""}${num(e.pnl)}
        </span>
      );
    case "Liquidated":
      return <>reward ${num(e.reward)}</>;
    default:
      return <>—</>;
  }
}

function Positions({ address, isConnected }: { address?: string; isConnected: boolean }) {
  const { network } = useNetwork();
  const MARKETS = network.markets;
  const keys = Object.keys(MARKETS) as MarketKey[];
  const contracts = keys.flatMap((k) => [
    {
      address: MARKETS[k]!.address,
      abi: perpMarketAbi as Abi,
      functionName: "positions",
      args: address ? [address] : [],
      chainId: network.chainId,
    },
    {
      address: MARKETS[k]!.address,
      abi: perpMarketAbi as Abi,
      functionName: "unrealizedPnl",
      args: address ? [address] : [],
      chainId: network.chainId,
    },
  ]);

  const { data, isLoading } = useReadContracts({
    contracts,
    query: { enabled: !!address && isConnected, refetchInterval: 10_000 },
  });

  if (!isConnected)
    return (
      <Empty title="No open positions">
        Connect a wallet to view your open positions across ETH, BTC &amp; SOL.
      </Empty>
    );
  if (isLoading || !data) return <Empty>Loading…</Empty>;

  const open = keys
    .map((k, i) => {
      const pos = data[i * 2]?.result as
        | readonly [bigint, bigint, bigint, bigint]
        | undefined;
      const pnl = data[i * 2 + 1]?.result as bigint | undefined;
      return { k, pos, pnl };
    })
    .filter((x) => x.pos && x.pos[0] !== 0n);

  if (open.length === 0)
    return (
      <Empty title="No open positions">
        When you open a long or short it&apos;ll appear here, across every market.
      </Empty>
    );

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            <th className="py-2 pr-3 font-medium">Market</th>
            <th className="py-2 pr-3 font-medium">Side</th>
            <th className="py-2 pr-3 text-right font-medium">Size</th>
            <th className="py-2 pr-3 text-right font-medium">Notional</th>
            <th className="py-2 pr-3 text-right font-medium">Margin</th>
            <th className="py-2 pl-3 text-right font-medium">uPnL</th>
          </tr>
        </thead>
        <tbody>
          {open.map(({ k, pos, pnl }) => {
            const size = pos![0];
            const isLong = size > 0n;
            const abs = isLong ? size : -size;
            const pnlNum = pnl !== undefined ? Number(formatUnits(pnl, 18)) : 0;
            return (
              <tr key={k} className="border-b border-line-soft last:border-0">
                <td className="py-2.5 pr-3 font-mono">{MARKETS[k]!.label}</td>
                <td className={`py-2.5 pr-3 font-medium ${isLong ? "text-green" : "text-wine"}`}>
                  {isLong ? "Long" : "Short"}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono">
                  {Number(formatUnits(abs, 18)).toLocaleString(undefined, {
                    maximumFractionDigits: 4,
                  })}
                </td>
                <td className="py-2.5 pr-3 text-right font-mono">${num(formatUnits(pos![1], 18))}</td>
                <td className="py-2.5 pr-3 text-right font-mono">${num(formatUnits(pos![2], 18))}</td>
                <td
                  className={`py-2.5 pl-3 text-right font-mono ${
                    pnlNum >= 0 ? "text-green" : "text-wine"
                  }`}
                >
                  {pnlNum >= 0 ? "+" : ""}${num(String(pnlNum))}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Leaderboard({ address }: { address?: string }) {
  const [sort, setSort] = useState<"realizedPnl" | "volume">("realizedPnl");

  return (
    <>
      <div className="mb-3 flex items-center justify-between">
        <p className="text-xs text-ink-dim">Ranked across all markets · updates every minute</p>
        <div className="flex gap-1.5">
          {(
            [
              ["realizedPnl", "PnL"],
              ["volume", "Volume"],
            ] as ["realizedPnl" | "volume", string][]
          ).map(([id, label]) => (
            <button
              key={id}
              onClick={() => setSort(id)}
              className={`rounded-md border px-2.5 py-1 text-xs transition ${
                sort === id
                  ? "border-amber bg-amber/10 text-amber"
                  : "border-line text-ink-soft hover:border-ink-dim"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {/* keyed by sort so it remounts (fresh loading state) when the sort changes */}
      <LeaderTable key={sort} sort={sort} address={address} />
    </>
  );
}

function LeaderTable({
  sort,
  address,
}: {
  sort: "realizedPnl" | "volume";
  address?: string;
}) {
  const { network } = useNetwork();
  const [rows, setRows] = useState<LeaderRow[] | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = () =>
      fetchLeaderboard(network.keeperApi, sort)
        .then((lb) => {
          if (cancelled) return;
          setRows(lb);
          setErr(null);
        })
        .catch(() => {
          if (cancelled) return;
          setErr("Couldn’t load leaderboard. Try again shortly.");
          setRows([]);
        });
    run();
    const t = setInterval(run, 60_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [sort, network.keeperApi]);

  return (
    <>
      {err ? (
        <Empty>{err}</Empty>
      ) : rows === null ? (
        <Empty>Loading…</Empty>
      ) : rows.length === 0 ? (
        <Empty title="Leaderboard is empty">
          No trades indexed yet — open a position and be the first on the board.
        </Empty>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                <th className="py-2 pr-3 font-medium">#</th>
                <th className="py-2 pr-3 font-medium">Trader</th>
                <th className="py-2 pr-3 text-right font-medium">Realized PnL</th>
                <th className="py-2 pr-3 text-right font-medium">Volume</th>
                <th className="py-2 pl-3 text-right font-medium">Trades</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const mine = address && r.trader.toLowerCase() === address.toLowerCase();
                const pnl = Number(r.realizedPnl);
                return (
                  <tr
                    key={r.trader}
                    className={`border-b border-line-soft last:border-0 ${
                      mine ? "bg-amber/5" : ""
                    }`}
                  >
                    <td className="py-2.5 pr-3 font-mono text-ink-dim">{i + 1}</td>
                    <td className="py-2.5 pr-3 font-mono">
                      <a
                        href={`${network.explorer}/address/${r.trader}`}
                        target="_blank"
                        rel="noreferrer"
                        className="hover:text-amber"
                      >
                        {short(r.trader)}
                      </a>
                      {mine && <span className="ml-2 text-[10px] text-amber">you</span>}
                    </td>
                    <td
                      className={`py-2.5 pr-3 text-right font-mono ${
                        pnl >= 0 ? "text-green" : "text-wine"
                      }`}
                    >
                      {pnl >= 0 ? "+" : ""}${num(r.realizedPnl)}
                    </td>
                    <td className="py-2.5 pr-3 text-right font-mono text-ink-soft">
                      ${num(r.volume)}
                    </td>
                    <td className="py-2.5 pl-3 text-right font-mono text-ink-soft">{r.trades}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
