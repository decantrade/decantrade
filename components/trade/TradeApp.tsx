"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { formatUnits, parseUnits, type Abi } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  ADDRESSES,
  DECANT_CHAIN,
  MARKETS,
  USDC_DECIMALS,
  erc20Abi,
  perpMarketAbi,
  type MarketKey,
} from "@/lib/decant";
import dynamic from "next/dynamic";
import { WALLETCONNECT_PROJECT_ID } from "@/lib/wagmi";
import { PriceChart } from "./PriceChart";
import { CreateMarket } from "./CreateMarket";
import { History } from "./History";
import { PnlCard, type PnlCardData } from "./PnlCard";
import { FundingPanel } from "./FundingPanel";

// Client-only so the WalletConnect SDK stays out of the server worker bundle.
const WalletConnectOption = dynamic(() => import("./WalletConnectOption"), {
  ssr: false,
});

const WAD = 10n ** 18n;

function fmtUsd(wad?: bigint, dp = 2) {
  if (wad === undefined) return "—";
  return Number(formatUnits(wad, 18)).toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
}

function fmtSigned(wad?: bigint, dp = 2) {
  if (wad === undefined) return "—";
  const n = Number(formatUnits(wad, 18));
  const s = n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  });
  return n > 0 ? `+${s}` : s;
}

function fmtPrice(n?: number, dp = 2) {
  if (n === undefined || !isFinite(n) || n <= 0) return "—";
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: dp,
    maximumFractionDigits: dp,
  })}`;
}

function fmtPct(n?: number, dp = 3) {
  if (n === undefined || !isFinite(n)) return "—";
  const s = (n * 100).toFixed(dp);
  return n > 0 ? `+${s}%` : `${s}%`;
}

// Estimated liquidation price using a linear (no-slippage) approximation of the
// account's margin ratio = maintenanceMarginRatio. Matches the on-chain trigger
// closely for small/medium positions; it ignores vAMM close slippage so it is a
// conservative-ish estimate, labelled "est." in the UI.
function estLiqPrice(
  isLong: boolean,
  sizeAbs: number,
  entry: number,
  effMargin: number,
  mmr: number,
): number | undefined {
  if (sizeAbs <= 0 || entry <= 0) return undefined;
  const lp = isLong
    ? (entry - effMargin / sizeAbs) / (1 - mmr)
    : (entry + effMargin / sizeAbs) / (1 + mmr);
  return lp > 0 ? lp : 0;
}

export function TradeApp() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [marketKey, setMarketKey] = useState<MarketKey>("ETH");
  const market = MARKETS[marketKey];
  const wrongNetwork = isConnected && chainId !== DECANT_CHAIN.id;

  // Testnet trading is a waitlist-member perk: only wallets that joined the
  // waitlist can trade. `member` is undefined while loading.
  const { data: member } = useQuery({
    queryKey: ["waitlist-member", address],
    enabled: isConnected && !!address,
    staleTime: 60_000,
    queryFn: async (): Promise<boolean | null> => {
      const r = await fetch(`/api/waitlist/check?address=${address}`);
      const d = (await r.json()) as { ok?: boolean; member?: boolean };
      return d?.ok ? !!d.member : null;
    },
  });
  const locked = isConnected && member === false;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("1000");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [margin, setMargin] = useState("100");
  const [leverage, setLeverage] = useState(5);
  const [side, setSide] = useState<"long" | "short">("long");
  const [showPnlCard, setShowPnlCard] = useState(false);
  // Client-side TP/SL (auto-close while this tab is open). Keyed per market.
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  // ----- reads -----
  const marketRead = (name: string, args: unknown[] = []) =>
    ({
      address: market.address,
      abi: perpMarketAbi as Abi,
      functionName: name,
      args,
      chainId: DECANT_CHAIN.id,
      query: { refetchInterval: 10_000 },
    }) as const;

  const { data: markPrice, refetch: refMark } = useReadContract(marketRead("getMarkPrice"));
  const { data: indexPrice, refetch: refIndex } = useReadContract(marketRead("getIndexPrice"));
  const { data: maxLev } = useReadContract(marketRead("maxLeverage"));
  const { data: mmrData } = useReadContract(marketRead("maintenanceMarginRatio"));
  const { data: feeRatioData } = useReadContract(marketRead("tradingFeeRatio"));
  const { data: baseRes, refetch: refBase } = useReadContract(marketRead("baseReserve"));
  const { data: quoteRes, refetch: refQuote } = useReadContract(marketRead("quoteReserve"));
  const { data: cumPrem, refetch: refCum } = useReadContract(marketRead("cumulativePremiumFraction"));
  const { data: lastFundingTime } = useReadContract(marketRead("lastFundingTime"));
  const { data: fundingIntervalData } = useReadContract(marketRead("fundingInterval"));
  const { data: freeColl, refetch: refFree } = useReadContract({
    ...marketRead("freeCollateral", address ? [address] : []),
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const { data: position, refetch: refPos } = useReadContract({
    ...marketRead("positions", address ? [address] : []),
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const { data: uPnl, refetch: refPnl } = useReadContract({
    ...marketRead("unrealizedPnl", address ? [address] : []),
    query: { enabled: !!address, refetchInterval: 10_000 },
  });
  const { data: usdcBal, refetch: refUsdc } = useReadContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi as Abi,
    functionName: "balanceOf",
    args: address ? [address] : [],
    chainId: DECANT_CHAIN.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: allowance, refetch: refAllow } = useReadContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi as Abi,
    functionName: "allowance",
    args: address ? [address, market.address] : [],
    chainId: DECANT_CHAIN.id,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const pos = position as readonly [bigint, bigint, bigint, bigint] | undefined;
  const hasPosition = !!pos && pos[0] !== 0n;
  const maxLevNum = maxLev ? Number((maxLev as bigint) / WAD) : 50;
  const levPresets = Array.from(
    new Set([1, 2, 5, 10, 25, maxLevNum].filter((v) => v >= 1 && v <= maxLevNum)),
  ).sort((a, b) => a - b);
  // Clamp for display/submission: `leverage` state can briefly exceed maxLevNum
  // before on-chain data loads or after switching to a lower-cap market.
  const effLeverage = Math.min(Math.max(leverage, 1), maxLevNum);

  function refetchAll() {
    refMark();
    refIndex();
    refFree();
    refPos();
    refPnl();
    refUsdc();
    refAllow();
    refBase();
    refQuote();
    refCum();
  }

  async function run(label: string, fn: () => Promise<`0x${string}`>) {
    setError(null);
    setBusy(label);
    try {
      const hash = await fn();
      await publicClient?.waitForTransactionReceipt({ hash });
      refetchAll();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 160));
    } finally {
      setBusy(null);
    }
  }

  let depositWad = 0n;
  try {
    depositWad = parseUnits(depositAmt || "0", USDC_DECIMALS);
  } catch {
    depositWad = 0n;
  }

  const needsApproval =
    depositWad > 0n && allowance !== undefined && (allowance as bigint) < depositWad;

  let withdrawWad = 0n;
  try {
    withdrawWad = parseUnits(withdrawAmt || "0", USDC_DECIMALS);
  } catch {
    withdrawWad = 0n;
  }
  // freeCollateral is WAD (1e18); withdraw() takes token-decimal units.
  const freeCollUnits =
    freeColl !== undefined ? (freeColl as bigint) / 10n ** BigInt(18 - USDC_DECIMALS) : 0n;
  const overWithdraw = withdrawWad > freeCollUnits;

  // ----- actions -----
  const mint = () =>
    run("mint", () =>
      writeContractAsync({
        address: ADDRESSES.usdc,
        abi: erc20Abi as Abi,
        functionName: "mint",
        args: [address!, parseUnits("100000", USDC_DECIMALS)],
      }),
    );

  const approve = () =>
    run("approve", () =>
      writeContractAsync({
        address: ADDRESSES.usdc,
        abi: erc20Abi as Abi,
        functionName: "approve",
        args: [market.address, parseUnits("1000000000", USDC_DECIMALS)],
      }),
    );

  const deposit = () =>
    run("deposit", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "deposit",
        args: [depositWad],
      }),
    );

  const withdraw = () =>
    run("withdraw", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "withdraw",
        args: [withdrawWad],
      }),
    );

  const open = () =>
    run("open", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "openPosition",
        args: [side === "long", parseUnits(margin || "0", 18), parseUnits(String(effLeverage), 18)],
      }),
    );

  const close = () =>
    run("close", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "closePosition",
        args: [],
      }),
    );

  // ----- derived estimates (liq price, funding, pre-trade preview) -----
  const markF = markPrice !== undefined ? Number(formatUnits(markPrice as bigint, 18)) : undefined;
  const indexF = indexPrice !== undefined ? Number(formatUnits(indexPrice as bigint, 18)) : undefined;
  const mmr = mmrData !== undefined ? Number(formatUnits(mmrData as bigint, 18)) : 0.01;
  const feeRatio = feeRatioData !== undefined ? Number(formatUnits(feeRatioData as bigint, 18)) : 0.001;
  const baseF = baseRes !== undefined ? Number(formatUnits(baseRes as bigint, 18)) : undefined;
  const quoteF = quoteRes !== undefined ? Number(formatUnits(quoteRes as bigint, 18)) : undefined;
  const cumF = cumPrem !== undefined ? Number(formatUnits(cumPrem as bigint, 18)) : 0;

  // Funding rate per interval (1h) as a fraction of index: (mark - index) / index.
  // Positive → longs pay shorts.
  const fundingRate =
    markF !== undefined && indexF !== undefined && indexF > 0
      ? (markF - indexF) / indexF
      : undefined;

  // Open position estimates.
  const posSizeF = pos ? Number(formatUnits(pos[0] < 0n ? -pos[0] : pos[0], 18)) : 0;
  const posSizeSigned = pos ? Number(formatUnits(pos[0], 18)) : 0;
  const posNotionalF = pos ? Number(formatUnits(pos[1], 18)) : 0;
  const posMarginF = pos ? Number(formatUnits(pos[2], 18)) : 0;
  const posLastPremF = pos ? Number(formatUnits(pos[3], 18)) : 0;
  const posEntry = posSizeF > 0 ? posNotionalF / posSizeF : undefined;
  const posIsLong = pos ? pos[0] > 0n : true;
  // Pending funding owed by the position (USD): size * (cum - last). Positive = owed.
  const posFunding = posSizeSigned * (cumF - posLastPremF);
  const posLiq =
    hasPosition && posEntry !== undefined
      ? estLiqPrice(posIsLong, posSizeF, posEntry, posMarginF - posFunding, mmr)
      : undefined;

  // Pre-trade preview for the order being composed.
  const marginNum = Number(margin || "0");
  const previewNotional = marginNum > 0 ? marginNum * effLeverage : 0;
  const previewFee = previewNotional * feeRatio;
  let previewEntry: number | undefined;
  let previewImpact: number | undefined;
  let previewLiq: number | undefined;
  if (
    previewNotional > 0 &&
    baseF !== undefined &&
    quoteF !== undefined &&
    markF !== undefined &&
    previewNotional < quoteF
  ) {
    const kF = baseF * quoteF;
    if (side === "long") {
      const newQuote = quoteF + previewNotional;
      const newBase = kF / newQuote;
      const sizeOut = baseF - newBase;
      if (sizeOut > 0) {
        previewEntry = previewNotional / sizeOut;
        previewImpact = previewEntry / markF - 1;
        previewLiq = estLiqPrice(true, sizeOut, previewEntry, marginNum - previewFee, mmr);
      }
    } else {
      const newQuote = quoteF - previewNotional;
      const newBase = kF / newQuote;
      const sizeOut = newBase - baseF;
      if (sizeOut > 0) {
        previewEntry = previewNotional / sizeOut;
        previewImpact = previewEntry / markF - 1;
        previewLiq = estLiqPrice(false, sizeOut, previewEntry, marginNum - previewFee, mmr);
      }
    }
  }

  // ----- funding countdown -----
  const fundingIntervalSec =
    fundingIntervalData !== undefined ? Number(fundingIntervalData as bigint) : 3600;
  const nextFundingTs =
    lastFundingTime !== undefined ? Number(lastFundingTime as bigint) + fundingIntervalSec : undefined;

  // ----- near-liquidation distance -----
  const liqDistance =
    hasPosition && posLiq !== undefined && posLiq > 0 && markF !== undefined
      ? Math.abs(markF - posLiq) / markF
      : undefined;
  const nearLiq = liqDistance !== undefined && liqDistance <= 0.05;

  // PnL card payload for the open position.
  const pnlCardData: PnlCardData | undefined =
    hasPosition && posEntry !== undefined && markF !== undefined
      ? {
          marketLabel: market.label,
          isLong: posIsLong,
          leverage: posMarginF > 0 ? Math.round(posNotionalF / posMarginF) : 1,
          entry: posEntry,
          mark: markF,
          roiPct: posMarginF > 0 ? (Number(formatUnits((uPnl as bigint) ?? 0n, 18)) / posMarginF) * 100 : 0,
          pnlUsd: uPnl !== undefined ? Number(formatUnits(uPnl as bigint, 18)) : 0,
        }
      : undefined;

  // ----- client-side TP/SL auto-close (runs only while this tab is open) -----
  // Guard so a trigger fires at most once until the position changes.
  const tpSlFired = useRef(false);
  useEffect(() => {
    tpSlFired.current = false;
  }, [marketKey, hasPosition]);
  useEffect(() => {
    if (!hasPosition || busy || markF === undefined || tpSlFired.current) return;
    const tp = Number(tpPrice);
    const sl = Number(slPrice);
    const hitTp = tp > 0 && (posIsLong ? markF >= tp : markF <= tp);
    const hitSl = sl > 0 && (posIsLong ? markF <= sl : markF >= sl);
    if (hitTp || hitSl) {
      tpSlFired.current = true;
      const label = hitTp ? "Take-profit" : "Stop-loss";
      const at = markF.toLocaleString(undefined, { maximumFractionDigits: 2 });
      // Defer out of the effect body to avoid a synchronous cascading render.
      queueMicrotask(() => {
        setNotice(`${label} hit at $${at} — closing position…`);
        close();
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markF, hasPosition, busy, tpPrice, slPrice, posIsLong]);

  // ----- near-liquidation browser notification (fires once per entry) -----
  const nearLiqNotified = useRef(false);
  useEffect(() => {
    if (!nearLiq) {
      nearLiqNotified.current = false;
      return;
    }
    if (nearLiqNotified.current) return;
    nearLiqNotified.current = true;
    if (typeof Notification !== "undefined" && Notification.permission === "granted") {
      new Notification("Decant — position near liquidation", {
        body: `${market.label} ${posIsLong ? "long" : "short"} is within ${(
          (liqDistance ?? 0) * 100
        ).toFixed(1)}% of its liquidation price.`,
      });
    }
  }, [nearLiq, liqDistance, market.label, posIsLong]);

  function enableNotifications() {
    if (typeof Notification === "undefined") return;
    Notification.requestPermission().then((p) => {
      if (p === "granted") setNotice("Browser notifications enabled.");
    });
  }

  // ----- render -----
  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber">── Testnet app</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Trade</h1>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/portfolio"
            className="rounded-lg border border-line px-4 py-2 text-sm text-ink-soft hover:border-amber hover:text-amber"
          >
            Portfolio
          </Link>
          <ConnectButton />
        </div>
      </div>

      {wrongNetwork && (
        <button
          onClick={() => switchChain({ chainId: DECANT_CHAIN.id })}
          className="mb-6 w-full rounded-lg border border-amber bg-amber/10 px-4 py-3 text-sm text-amber"
        >
          Wrong network — switch to Base Sepolia
        </button>
      )}

      {/* Market tabs */}
      <div className="mb-6 flex gap-2">
        {(Object.keys(MARKETS) as MarketKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setMarketKey(k)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              k === marketKey
                ? "border-amber bg-amber/10 text-amber"
                : "border-line text-ink-soft hover:border-ink-dim"
            }`}
          >
            {MARKETS[k].label}
          </button>
        ))}
      </div>

      {/* Price chart */}
      <PriceChart marketKey={marketKey} />

      {/* Funding countdown + recent funding history */}
      <FundingPanel
        marketKey={marketKey}
        fundingRate={fundingRate}
        nextFundingTs={nextFundingTs}
        intervalSec={fundingIntervalSec}
      />

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Stat label="Mark price" value={`$${fmtUsd(markPrice as bigint)}`} accent="text-ink" />
        <Stat label="Index (oracle)" value={`$${fmtUsd(indexPrice as bigint)}`} accent="text-ink-soft" />
        <Stat
          label="Funding / 1h"
          value={fmtPct(fundingRate)}
          accent={
            fundingRate === undefined
              ? "text-ink-soft"
              : fundingRate >= 0
                ? "text-green"
                : "text-wine"
          }
        />
        <Stat label="Max leverage" value={`${maxLevNum}×`} accent="text-amber" />
        <Stat
          label="Free collateral"
          value={`$${fmtUsd(freeColl as bigint)}`}
          accent="text-green"
        />
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-wine/50 bg-wine/10 px-4 py-3 text-xs text-wine">
          {error}
        </div>
      )}

      {notice && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-amber/50 bg-amber/10 px-4 py-3 text-xs text-amber">
          <span>{notice}</span>
          <button onClick={() => setNotice(null)} className="text-amber/70 hover:text-amber">
            ✕
          </button>
        </div>
      )}

      {nearLiq && (
        <div className="mb-4 rounded-lg border border-wine/60 bg-wine/15 px-4 py-3 text-xs text-wine">
          ⚠ Your {market.label} position is within{" "}
          {((liqDistance ?? 0) * 100).toFixed(1)}% of its estimated liquidation price. Add margin
          or close to avoid liquidation.
        </div>
      )}

      {!isConnected ? (
        <div className="rounded-xl border border-line bg-panel p-8 text-center text-ink-soft">
          Connect a wallet to start trading on testnet.
        </div>
      ) : locked ? (
        <WaitlistGate address={address} />
      ) : (
        <div className="grid gap-5 md:grid-cols-2">
          {/* Collateral */}
          <div className="rounded-xl border border-line bg-panel p-5">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-soft">
              Collateral
            </h2>
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-ink-dim">Wallet tUSDC</span>
              <span className="font-mono">
                {usdcBal !== undefined
                  ? Number(formatUnits(usdcBal as bigint, USDC_DECIMALS)).toLocaleString()
                  : "—"}
              </span>
            </div>
            <button
              onClick={mint}
              disabled={!!busy || wrongNetwork}
              className="mb-4 w-full rounded-lg border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-amber hover:text-amber disabled:opacity-40"
            >
              {busy === "mint" ? "Minting…" : "Faucet: mint 100,000 tUSDC"}
            </button>
            <label className="mb-1 block text-xs text-ink-dim">Deposit amount (tUSDC)</label>
            <input
              value={depositAmt}
              onChange={(e) => setDepositAmt(e.target.value)}
              inputMode="decimal"
              className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-amber"
            />
            {needsApproval ? (
              <button
                onClick={approve}
                disabled={!!busy || wrongNetwork}
                className="w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
              >
                {busy === "approve" ? "Approving…" : "Approve tUSDC"}
              </button>
            ) : (
              <button
                onClick={deposit}
                disabled={!!busy || wrongNetwork || depositWad === 0n}
                className="w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
              >
                {busy === "deposit" ? "Depositing…" : "Deposit"}
              </button>
            )}

            <div className="mt-5 border-t border-line-soft pt-4">
              <div className="mb-1 flex items-center justify-between text-xs text-ink-dim">
                <span>Withdraw (tUSDC)</span>
                <button
                  type="button"
                  onClick={() =>
                    setWithdrawAmt(formatUnits(freeCollUnits, USDC_DECIMALS))
                  }
                  className="font-mono text-amber hover:opacity-80"
                >
                  Max ${fmtUsd(freeColl as bigint)}
                </button>
              </div>
              <input
                value={withdrawAmt}
                onChange={(e) => setWithdrawAmt(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-amber"
              />
              <button
                onClick={withdraw}
                disabled={
                  !!busy || wrongNetwork || withdrawWad === 0n || overWithdraw
                }
                className="w-full rounded-lg border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-amber hover:text-amber disabled:opacity-40"
              >
                {busy === "withdraw"
                  ? "Withdrawing…"
                  : overWithdraw
                    ? "Exceeds free collateral"
                    : "Withdraw"}
              </button>
            </div>
          </div>

          {/* Trade / Position */}
          <div className="rounded-xl border border-line bg-panel p-5">
            {hasPosition ? (
              <>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-wider text-ink-soft">
                    Your position
                  </h2>
                  <button
                    onClick={enableNotifications}
                    className="text-[11px] text-ink-dim hover:text-amber"
                  >
                    🔔 Enable alerts
                  </button>
                </div>
                <PosRow label="Side" value={pos![0] > 0n ? "Long" : "Short"} />
                <PosRow
                  label={`Size (${market.symbol})`}
                  value={fmtSigned(pos![0] < 0n ? -pos![0] : pos![0], 4)}
                />
                <PosRow label="Entry price" value={fmtPrice(posEntry)} />
                <PosRow label="Notional" value={`$${fmtUsd(pos![1])}`} />
                <PosRow label="Margin" value={`$${fmtUsd(pos![2])}`} />
                <PosRow
                  label="Est. liq. price"
                  value={fmtPrice(posLiq)}
                  valueClass="text-wine"
                />
                <PosRow
                  label="Funding (accrued)"
                  value={`$${fmtSigned(BigInt(Math.round(posFunding * 1e18)))}`}
                  valueClass={posFunding > 0 ? "text-wine" : "text-green"}
                />
                <PosRow
                  label="Unrealized PnL"
                  value={`$${fmtSigned(uPnl as bigint)}`}
                  valueClass={
                    (uPnl as bigint) >= 0n ? "text-green" : "text-wine"
                  }
                />
                {/* Client-side TP / SL */}
                <div className="mt-4 rounded-lg border border-line-soft bg-bg/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                      Take-profit / Stop-loss
                    </p>
                    <span className="text-[10px] text-ink-dim">auto-close · beta</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="mb-1 block text-[11px] text-green">TP price</label>
                      <input
                        value={tpPrice}
                        onChange={(e) => setTpPrice(e.target.value)}
                        inputMode="decimal"
                        placeholder="—"
                        className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-green"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-[11px] text-wine">SL price</label>
                      <input
                        value={slPrice}
                        onChange={(e) => setSlPrice(e.target.value)}
                        inputMode="decimal"
                        placeholder="—"
                        className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-wine"
                      />
                    </div>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-ink-dim">
                    Triggers run in your browser and auto-close while this tab is open. Not an
                    on-chain order — keep the tab open.
                  </p>
                </div>

                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setShowPnlCard(true)}
                    className="rounded-lg border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-amber hover:text-amber"
                  >
                    Share PnL
                  </button>
                  <button
                    onClick={close}
                    disabled={!!busy || wrongNetwork}
                    className="rounded-lg border border-wine bg-wine/10 px-4 py-2.5 text-sm font-semibold text-wine disabled:opacity-40"
                  >
                    {busy === "close" ? "Closing…" : "Close position"}
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                  Open position
                </h2>
                <div className="mb-4 grid grid-cols-2 gap-2">
                  <button
                    onClick={() => setSide("long")}
                    className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                      side === "long"
                        ? "border-green bg-green/10 text-green"
                        : "border-line text-ink-soft"
                    }`}
                  >
                    Long
                  </button>
                  <button
                    onClick={() => setSide("short")}
                    className={`rounded-lg border px-4 py-2.5 text-sm font-semibold ${
                      side === "short"
                        ? "border-wine bg-wine/10 text-wine"
                        : "border-line text-ink-soft"
                    }`}
                  >
                    Short
                  </button>
                </div>
                <label className="mb-1 block text-xs text-ink-dim">Margin (USD)</label>
                <input
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  inputMode="decimal"
                  className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-amber"
                />
                <div className="mb-1.5 flex justify-between text-xs text-ink-dim">
                  <span>Leverage</span>
                  <span className="font-mono text-amber">{effLeverage}×</span>
                </div>
                <div className="mb-2 flex gap-1.5">
                  {levPresets.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setLeverage(v)}
                      className={`flex-1 rounded-lg border py-1.5 text-xs font-mono transition ${
                        effLeverage === v
                          ? "border-amber bg-amber/10 text-amber"
                          : "border-line text-ink-soft hover:border-ink-dim"
                      }`}
                    >
                      {v}×
                    </button>
                  ))}
                </div>
                <input
                  type="range"
                  min={1}
                  max={maxLevNum}
                  step={1}
                  value={effLeverage}
                  onChange={(e) => setLeverage(Number(e.target.value))}
                  className="mb-3 w-full accent-amber"
                />
                {/* Pre-trade preview */}
                <div className="mb-4 mt-1 rounded-lg border border-line-soft bg-bg/40 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                    Order preview
                  </p>
                  <PreviewRow
                    label="Notional"
                    value={`$${previewNotional.toLocaleString(undefined, { maximumFractionDigits: 2 })}`}
                  />
                  <PreviewRow label="Est. entry price" value={fmtPrice(previewEntry)} />
                  <PreviewRow
                    label="Price impact"
                    value={previewImpact === undefined ? "—" : fmtPct(Math.abs(previewImpact), 3)}
                    valueClass={
                      previewImpact !== undefined && Math.abs(previewImpact) > 0.01
                        ? "text-wine"
                        : "text-ink-soft"
                    }
                  />
                  <PreviewRow
                    label="Trading fee"
                    value={`$${previewFee.toLocaleString(undefined, { maximumFractionDigits: 2 })} (${(feeRatio * 100).toFixed(2)}%)`}
                  />
                  <PreviewRow
                    label="Est. liq. price"
                    value={fmtPrice(previewLiq)}
                    valueClass="text-wine"
                  />
                </div>
                <button
                  onClick={open}
                  disabled={!!busy || wrongNetwork || Number(margin) <= 0}
                  className="w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
                >
                  {busy === "open"
                    ? "Opening…"
                    : `Open ${side === "long" ? "Long" : "Short"}`}
                </button>
              </>
            )}
          </div>
        </div>
      )}

      <History />

      <CreateMarket locked={locked} />

      {showPnlCard && pnlCardData && (
        <PnlCard data={pnlCardData} onClose={() => setShowPnlCard(false)} />
      )}

      <p className="mt-8 text-center text-xs text-ink-dim">
        Testnet only · Base Sepolia · tokens have no value · not audited
      </p>
    </div>
  );
}

function Stat({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-panel p-4">
      <p className="mb-1 text-[10px] uppercase tracking-[0.18em] text-ink-dim">{label}</p>
      <p className={`font-mono text-lg ${accent}`}>{value}</p>
    </div>
  );
}

function PosRow({
  label,
  value,
  valueClass = "",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft py-2 text-sm last:border-0">
      <span className="text-ink-dim">{label}</span>
      <span className={`font-mono ${valueClass}`}>{value}</span>
    </div>
  );
}

function PreviewRow({
  label,
  value,
  valueClass = "text-ink-soft",
}: {
  label: string;
  value: string;
  valueClass?: string;
}) {
  return (
    <div className="flex items-center justify-between py-0.5 text-xs">
      <span className="text-ink-dim">{label}</span>
      <span className={`font-mono ${valueClass}`}>{value}</span>
    </div>
  );
}

function WaitlistGate({ address }: { address?: `0x${string}` }) {
  return (
    <div className="rounded-xl border border-amber/40 bg-amber/5 p-8 text-center">
      <p className="text-[11px] uppercase tracking-[0.22em] text-amber">
        ── Waitlist only
      </p>
      <h2 className="mt-2 text-lg font-semibold tracking-tight">
        Testnet trading is for waitlist members
      </h2>
      <p className="mx-auto mt-3 max-w-md text-sm text-ink-soft">
        {address ? (
          <>
            <span className="font-mono text-ink">
              {address.slice(0, 6)}…{address.slice(-4)}
            </span>{" "}
            isn&apos;t on the Decant waitlist yet.
          </>
        ) : (
          <>This wallet isn&apos;t on the Decant waitlist yet.</>
        )}{" "}
        Join the waitlist with this wallet to unlock deposits, leverage and
        market launches. Charts and prices stay open to everyone.
      </p>
      <Link
        href="/#waitlist"
        className="mt-5 inline-block rounded-lg bg-amber px-5 py-2.5 text-sm font-semibold text-bg hover:opacity-90"
      >
        Join the waitlist →
      </Link>
    </div>
  );
}

function ConnectButton() {
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const [open, setOpen] = useState(false);
  if (isConnected && address) {
    return (
      <button
        onClick={() => disconnect()}
        className="rounded-lg border border-line px-4 py-2 font-mono text-sm text-ink-soft hover:border-wine hover:text-wine"
      >
        {address.slice(0, 6)}…{address.slice(-4)}
      </button>
    );
  }
  // WalletConnect is registered lazily on the client, so it may already be in
  // `connectors` after first use — dedupe to avoid showing it twice.
  const builtinConnectors = connectors.filter((c) => c.id !== "walletConnect");
  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        disabled={connecting}
        className="rounded-lg bg-amber px-4 py-2 text-sm font-semibold text-bg disabled:opacity-40"
      >
        {connecting ? "Connecting…" : "Connect wallet"}
      </button>
      {open && (
        <div className="absolute right-0 z-10 mt-2 w-48 rounded-lg border border-line bg-panel p-1 shadow-xl">
          {builtinConnectors.map((c) => (
            <button
              key={c.uid}
              onClick={() => {
                connect({ connector: c });
                setOpen(false);
              }}
              className="block w-full rounded px-3 py-2 text-left text-sm text-ink-soft hover:bg-bg-soft hover:text-ink"
            >
              {c.name}
            </button>
          ))}
          {WALLETCONNECT_PROJECT_ID && (
            <WalletConnectOption
              onSelect={() => setOpen(false)}
              className="block w-full rounded px-3 py-2 text-left text-sm text-ink-soft hover:bg-bg-soft hover:text-ink"
            />
          )}
        </div>
      )}
    </div>
  );
}
