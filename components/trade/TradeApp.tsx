"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
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
  USDC_DECIMALS,
  erc20Abi,
  perpMarketAbi,
  type MarketKey,
} from "@/lib/decant";
import { useNetwork } from "@/lib/network";
import dynamic from "next/dynamic";
import { WALLETCONNECT_PROJECT_ID } from "@/lib/wagmi";
import { PriceChart } from "./PriceChart";
import { History } from "./History";
import { PnlCard, type PnlCardData } from "./PnlCard";
import { FundingPanel } from "./FundingPanel";

// Client-only so the WalletConnect SDK stays out of the server worker bundle.
const WalletConnectOption = dynamic(() => import("./WalletConnectOption"), {
  ssr: false,
});

const WAD = 10n ** 18n;

// Client-side limit order (entry trigger), persisted per market+wallet.
type LimitOrder = { isLong: boolean; margin: string; leverage: number; price: number };

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

  const { network } = useNetwork();
  const DECANT_CHAIN = network.chain;
  const ADDRESSES = network.addresses;
  const MARKETS = network.markets;
  const marketKeys = Object.keys(MARKETS) as MarketKey[];

  const [marketKey, setMarketKey] = useState<MarketKey>("ETH");
  // Fall back to the first available market when the selected one isn't listed.
  const activeMarketKey: MarketKey = MARKETS[marketKey] ? marketKey : marketKeys[0];
  const market = MARKETS[activeMarketKey]!;
  const wrongNetwork = isConnected && chainId !== network.chainId;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("100");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [margin, setMargin] = useState("100");
  const [leverage, setLeverage] = useState(5);
  const [side, setSide] = useState<"long" | "short">("long");
  const [showPnlCard, setShowPnlCard] = useState(false);
  // Client-side TP/SL (auto-close while this tab is open). Keyed per market.
  const [tpPrice, setTpPrice] = useState("");
  const [slPrice, setSlPrice] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [marginAdjustAmt, setMarginAdjustAmt] = useState("");
  // Client-side limit order (auto-open while this tab is open). Keyed per market.
  const [limitPrice, setLimitPrice] = useState("");
  const [pendingLimit, setPendingLimit] = useState<LimitOrder | null>(null);
  // Whether this browser tab is currently visible. Client-side triggers
  // (TP/SL/limit) only fire while the tab is open + foregrounded, so we surface
  // this so users know their order is actively being watched.
  const [tabHidden, setTabHidden] = useState(false);

  // ----- reads -----
  const marketRead = (name: string, args: unknown[] = []) =>
    ({
      address: market.address,
      abi: perpMarketAbi as Abi,
      functionName: name,
      args,
      chainId: network.chainId,
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
    chainId: network.chainId,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });
  const { data: allowance, refetch: refAllow } = useReadContract({
    address: ADDRESSES.usdc,
    abi: erc20Abi as Abi,
    functionName: "allowance",
    args: address ? [address, market.address] : [],
    chainId: network.chainId,
    query: { enabled: !!address, refetchInterval: 15_000 },
  });

  const pos = position as readonly [bigint, bigint, bigint, bigint] | undefined;
  const hasPosition = !!pos && pos[0] !== 0n;
  const maxLevNum = maxLev ? Number((maxLev as bigint) / WAD) : 10;
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

  // addMargin / removeMargin take WAD amounts (margin + freeCollateral are WAD).
  let marginAdjustWad = 0n;
  try {
    marginAdjustWad = parseUnits(marginAdjustAmt || "0", 18);
  } catch {
    marginAdjustWad = 0n;
  }
  const overAddMargin = marginAdjustWad > (freeColl !== undefined ? (freeColl as bigint) : 0n);
  const overRemoveMargin = marginAdjustWad >= (pos ? pos[2] : 0n);

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

  const openWith = (isLong: boolean, marginStr: string, lev: number) =>
    run("open", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "openPosition",
        args: [isLong, parseUnits(marginStr || "0", 18), parseUnits(String(lev), 18)],
      }),
    );

  const open = () => openWith(side === "long", margin, effLeverage);

  // ----- limit order place / cancel (persisted in localStorage) -----
  const limitKey = address
    ? `decant:limit:${network.chainId}:${market.address}:${address}`
    : null;

  const placeLimit = () => {
    const price = Number(limitPrice);
    if (!(price > 0) || !limitKey) return;
    const order: LimitOrder = { isLong: side === "long", margin, leverage: effLeverage, price };
    setPendingLimit(order);
    try {
      localStorage.setItem(limitKey, JSON.stringify(order));
    } catch {}
    setLimitPrice("");
  };

  const cancelLimit = () => {
    setPendingLimit(null);
    if (limitKey) {
      try {
        localStorage.removeItem(limitKey);
      } catch {}
    }
  };

  const close = () =>
    run("close", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "closePosition",
        args: [],
      }),
    );

  // Close a fraction of the position (WAD; 1e18 = 100%).
  const closeFraction = (fraction: bigint, label: string) =>
    run(label, () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "closePartial",
        args: [fraction],
      }),
    );

  const addMargin = () =>
    run("addMargin", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "addMargin",
        args: [marginAdjustWad],
      }),
    );

  const removeMargin = () =>
    run("removeMargin", () =>
      writeContractAsync({
        address: market.address,
        abi: perpMarketAbi as Abi,
        functionName: "removeMargin",
        args: [marginAdjustWad],
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
  }, [activeMarketKey, hasPosition]);
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

  // ----- client-side limit-order auto-open (runs only while this tab is open) -----
  // Restore any persisted order when the market or wallet changes.
  useEffect(() => {
    let order: LimitOrder | null = null;
    if (limitKey) {
      try {
        const raw = localStorage.getItem(limitKey);
        order = raw ? (JSON.parse(raw) as LimitOrder) : null;
      } catch {
        order = null;
      }
    }
    // Defer out of the effect body (avoids set-state-in-effect cascade).
    queueMicrotask(() => setPendingLimit(order));
  }, [limitKey]);

  const limitFired = useRef(false);
  useEffect(() => {
    limitFired.current = false;
  }, [limitKey, hasPosition]);
  useEffect(() => {
    if (!pendingLimit || hasPosition || busy || markF === undefined || limitFired.current) return;
    const hit = pendingLimit.isLong ? markF <= pendingLimit.price : markF >= pendingLimit.price;
    if (!hit) return;
    limitFired.current = true;
    const order = pendingLimit;
    const at = markF.toLocaleString(undefined, { maximumFractionDigits: 2 });
    // Defer out of the effect body to avoid a synchronous cascading render.
    queueMicrotask(() => {
      setNotice(`Limit ${order.isLong ? "long" : "short"} triggered at $${at} — opening…`);
      cancelLimit();
      openWith(order.isLong, order.margin, order.leverage);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [markF, pendingLimit, hasPosition, busy]);

  // ----- tab visibility (client-side triggers only run while foregrounded) -----
  useEffect(() => {
    const onVis = () => setTabHidden(document.visibilityState === "hidden");
    onVis();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, []);
  const hasClientOrder = !!pendingLimit || tpPrice.trim() !== "" || slPrice.trim() !== "";

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
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber">
            ── Mainnet beta
          </p>
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

      {network.guarded && (
        <div className="mb-6 rounded-lg border border-amber/40 bg-amber/5 px-4 py-3 text-xs text-ink-soft">
          <span className="font-semibold text-amber">Guarded beta · real funds.</span>{" "}
          ETH, BTC & SOL on Base mainnet, gated to $DECANT holders / allowlist.
          Caps: max $200 deposit per wallet, 10× leverage, $2,000 open interest.
          Unaudited — trade small.
        </div>
      )}

      {wrongNetwork && (
        <button
          onClick={() => switchChain({ chainId: network.chainId })}
          className="mb-6 w-full rounded-lg border border-amber bg-amber/10 px-4 py-3 text-sm text-amber"
        >
          Wrong network — switch to {DECANT_CHAIN.name}
        </button>
      )}

      {/* Market tabs */}
      <div className="mb-3 flex gap-2">
        {(Object.keys(MARKETS) as MarketKey[]).map((k) => (
          <button
            key={k}
            onClick={() => setMarketKey(k)}
            className={`rounded-lg border px-4 py-2 text-sm font-medium transition ${
              k === activeMarketKey
                ? "border-amber bg-amber/10 text-amber"
                : "border-line text-ink-soft hover:border-ink-dim"
            }`}
          >
            {MARKETS[k]!.label}
          </button>
        ))}
      </div>

      {/* Verify the active market + collateral on the block explorer */}
      <div className="mb-6 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-ink-dim">
        <span className="uppercase tracking-[0.12em]">Verify on {network.guarded ? "Basescan" : "explorer"}:</span>
        <a
          href={`${network.explorer}/address/${market.address}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-ink-soft transition-colors hover:text-amber"
        >
          {market.label} {market.address.slice(0, 6)}…{market.address.slice(-4)} ↗
        </a>
        <a
          href={`${network.explorer}/address/${ADDRESSES.usdc}`}
          target="_blank"
          rel="noreferrer"
          className="font-mono text-ink-soft transition-colors hover:text-amber"
        >
          {network.collateralLabel} {ADDRESSES.usdc.slice(0, 6)}…{ADDRESSES.usdc.slice(-4)} ↗
        </a>
      </div>

      {/* Price chart */}
      <PriceChart marketKey={activeMarketKey} />

      {/* Funding countdown + recent funding history */}
      <FundingPanel
        marketKey={activeMarketKey}
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

      {hasClientOrder && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-lg border px-4 py-3 text-xs ${
            tabHidden
              ? "border-wine/60 bg-wine/15 text-wine"
              : "border-amber/50 bg-amber/5 text-ink-soft"
          }`}
        >
          <span
            className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${
              tabHidden ? "bg-wine" : "bg-green animate-pulse"
            }`}
          />
          <div>
            <span className="font-semibold text-ink">
              {tabHidden ? "Order monitoring paused" : "Watching your order in this tab"}
            </span>{" "}
            {tabHidden
              ? "This tab is in the background — TP/SL & limit orders will NOT trigger until you return to it."
              : "TP/SL & limit orders are client-side: they only execute while this tab is open and visible. Don't close or background it, and never rely on them as guaranteed stops."}
          </div>
        </div>
      )}

      {!isConnected ? (
        <div className="rounded-xl border border-line bg-panel p-8 text-center">
          <h2 className="text-lg font-semibold tracking-tight">Connect a wallet to trade</h2>
          <p className="mx-auto mt-2 max-w-sm text-sm text-ink-soft">
            Trading runs on Base mainnet with real USDC. Use the{" "}
            <span className="text-amber">Connect wallet</span>{" "}
            button above to get started — you&apos;ll need to be allowlisted or hold $DECANT
            during the guarded beta.
          </p>
          <div className="mx-auto mt-5 grid max-w-md grid-cols-1 gap-2 text-left sm:grid-cols-3">
            {[
              ["1 · Connect", "Connect on Base mainnet."],
              ["2 · Deposit", "Add USDC collateral (max $200)."],
              ["3 · Trade", "Open ETH, BTC or SOL up to 10×."],
            ].map(([t, d]) => (
              <div key={t} className="rounded-lg border border-line bg-bg px-3 py-2.5">
                <p className="text-xs font-semibold text-ink">{t}</p>
                <p className="mt-0.5 text-[11px] text-ink-dim">{d}</p>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid gap-5 md:grid-cols-5">
          {/* Collateral */}
          <div className="rounded-xl border border-line bg-panel p-5 md:col-span-2">
            <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-soft">
              Collateral
            </h2>
            <div className="mb-4 flex items-center justify-between text-sm">
              <span className="text-ink-dim">Wallet {network.collateralLabel}</span>
              <span className="font-mono">
                {usdcBal !== undefined
                  ? Number(formatUnits(usdcBal as bigint, USDC_DECIMALS)).toLocaleString()
                  : "—"}
              </span>
            </div>
            {network.hasFaucet && (
              <button
                onClick={mint}
                disabled={!!busy || wrongNetwork}
                className="mb-4 w-full rounded-lg border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-amber hover:text-amber disabled:opacity-40"
              >
                {busy === "mint" ? "Minting…" : `Faucet: mint 100,000 ${network.collateralLabel}`}
              </button>
            )}
            <label className="mb-1 block text-xs text-ink-dim">
              Deposit amount ({network.collateralLabel})
            </label>
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
                {busy === "approve" ? "Approving…" : `Approve ${network.collateralLabel}`}
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
                <span>Withdraw ({network.collateralLabel})</span>
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
          <div className="rounded-xl border border-line bg-panel p-5 md:col-span-3">
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
                    <span className="text-amber">⚠ Client-side only.</span> Triggers run in this
                    browser tab and auto-close while it stays open &amp; visible. They are{" "}
                    <span className="text-ink-soft">not on-chain orders</span> — if you close or
                    background the tab, they will not fire. Don&apos;t rely on them as guaranteed
                    stops.
                  </p>
                </div>

                {/* Adjust margin */}
                <div className="mt-4 rounded-lg border border-line-soft bg-bg/40 p-3">
                  <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                    Adjust margin
                  </p>
                  <input
                    value={marginAdjustAmt}
                    onChange={(e) => setMarginAdjustAmt(e.target.value)}
                    inputMode="decimal"
                    placeholder={`Amount (${network.collateralLabel})`}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-amber"
                  />
                  <div className="mt-2 grid grid-cols-2 gap-2">
                    <button
                      onClick={addMargin}
                      disabled={!!busy || wrongNetwork || marginAdjustWad === 0n || overAddMargin}
                      className="rounded-lg border border-green px-4 py-2.5 text-sm font-semibold text-green disabled:opacity-40"
                    >
                      {busy === "addMargin" ? "Adding…" : overAddMargin ? "Low free coll." : "Add"}
                    </button>
                    <button
                      onClick={removeMargin}
                      disabled={!!busy || wrongNetwork || marginAdjustWad === 0n || overRemoveMargin}
                      className="rounded-lg border border-line px-4 py-2.5 text-sm font-semibold text-ink-soft hover:border-amber hover:text-amber disabled:opacity-40"
                    >
                      {busy === "removeMargin" ? "Removing…" : "Remove"}
                    </button>
                  </div>
                  <p className="mt-2 text-[10px] leading-relaxed text-ink-dim">
                    Add collateral to cut liquidation risk, or remove free margin (kept under max
                    leverage &amp; maintenance).
                  </p>
                </div>

                {/* Close (partial or full) */}
                <div className="mt-3">
                  <p className="mb-1.5 text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                    Close position
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      onClick={() => closeFraction(250000000000000000n, "close25")}
                      disabled={!!busy || wrongNetwork}
                      className="rounded-lg border border-wine/60 bg-wine/5 px-3 py-2.5 text-sm font-semibold text-wine disabled:opacity-40"
                    >
                      {busy === "close25" ? "…" : "25%"}
                    </button>
                    <button
                      onClick={() => closeFraction(500000000000000000n, "close50")}
                      disabled={!!busy || wrongNetwork}
                      className="rounded-lg border border-wine/60 bg-wine/5 px-3 py-2.5 text-sm font-semibold text-wine disabled:opacity-40"
                    >
                      {busy === "close50" ? "…" : "50%"}
                    </button>
                    <button
                      onClick={close}
                      disabled={!!busy || wrongNetwork}
                      className="rounded-lg border border-wine bg-wine/10 px-3 py-2.5 text-sm font-semibold text-wine disabled:opacity-40"
                    >
                      {busy === "close" ? "Closing…" : "100%"}
                    </button>
                  </div>
                </div>

                <button
                  onClick={() => setShowPnlCard(true)}
                  className="mt-3 w-full rounded-lg border border-line px-4 py-2.5 text-sm text-ink-soft hover:border-amber hover:text-amber"
                >
                  Share PnL
                </button>
              </>
            ) : (
              <>
                <h2 className="mb-5 text-base font-semibold uppercase tracking-wider text-ink-soft">
                  Open position
                </h2>
                {pendingLimit && (
                  <div className="mb-4 rounded-lg border border-amber/50 bg-amber/5 p-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-amber">
                        Limit {pendingLimit.isLong ? "long" : "short"} pending
                      </span>
                      <button
                        onClick={cancelLimit}
                        className="text-ink-dim hover:text-wine"
                      >
                        Cancel
                      </button>
                    </div>
                    <p className="mt-1 text-ink-soft">
                      Open ${pendingLimit.margin} × {pendingLimit.leverage}× when mark{" "}
                      {pendingLimit.isLong ? "≤" : "≥"} {fmtPrice(pendingLimit.price)}
                    </p>
                  </div>
                )}
                <div className="mb-4 grid grid-cols-2 gap-3">
                  <button
                    onClick={() => setSide("long")}
                    className={`rounded-lg border px-4 py-3 text-base font-semibold ${
                      side === "long"
                        ? "border-green bg-green/10 text-green"
                        : "border-line text-ink-soft"
                    }`}
                  >
                    Long
                  </button>
                  <button
                    onClick={() => setSide("short")}
                    className={`rounded-lg border px-4 py-3 text-base font-semibold ${
                      side === "short"
                        ? "border-wine bg-wine/10 text-wine"
                        : "border-line text-ink-soft"
                    }`}
                  >
                    Short
                  </button>
                </div>
                <label className="mb-1.5 block text-sm text-ink-dim">Margin (USD)</label>
                <input
                  value={margin}
                  onChange={(e) => setMargin(e.target.value)}
                  inputMode="decimal"
                  className="mb-3 w-full rounded-lg border border-line bg-bg px-3 py-3 font-mono text-base outline-none focus:border-amber"
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
                  className="w-full rounded-lg bg-amber px-4 py-3.5 text-base font-semibold text-bg disabled:opacity-40"
                >
                  {busy === "open"
                    ? "Opening…"
                    : `Open ${side === "long" ? "Long" : "Short"}`}
                </button>

                {/* Limit order (client-side) */}
                <div className="mt-4 rounded-lg border border-line-soft bg-bg/40 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                      Limit order
                    </p>
                    <span className="text-[10px] text-ink-dim">auto-open · beta</span>
                  </div>
                  <input
                    value={limitPrice}
                    onChange={(e) => setLimitPrice(e.target.value)}
                    inputMode="decimal"
                    placeholder={`Trigger price (${market.symbol}/USD)`}
                    className="w-full rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm outline-none focus:border-amber"
                  />
                  <button
                    onClick={placeLimit}
                    disabled={
                      !!busy ||
                      wrongNetwork ||
                      !(Number(limitPrice) > 0) ||
                      Number(margin) <= 0
                    }
                    className="mt-2 w-full rounded-lg border border-amber px-4 py-2.5 text-sm font-semibold text-amber disabled:opacity-40"
                  >
                    {`Place limit ${side === "long" ? "long" : "short"}`}
                  </button>
                  <p className="mt-2 text-[10px] leading-relaxed text-ink-dim">
                    Opens a {side} when mark {side === "long" ? "≤" : "≥"} your trigger.{" "}
                    <span className="text-amber">⚠ Client-side only</span> — runs in this browser
                    tab and only fires while it stays open &amp; visible. Not an on-chain order.
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <History />

      {showPnlCard && pnlCardData && (
        <PnlCard data={pnlCardData} onClose={() => setShowPnlCard(false)} />
      )}

      <p className="mt-8 text-center text-xs text-ink-dim">
        Guarded beta · Base mainnet · real funds · capped · not audited
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
