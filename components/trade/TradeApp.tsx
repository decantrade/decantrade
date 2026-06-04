"use client";

import { useState } from "react";
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

export function TradeApp() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();

  const [marketKey, setMarketKey] = useState<MarketKey>("ETH");
  const market = MARKETS[marketKey];
  const wrongNetwork = isConnected && chainId !== DECANT_CHAIN.id;

  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [depositAmt, setDepositAmt] = useState("1000");
  const [withdrawAmt, setWithdrawAmt] = useState("");
  const [margin, setMargin] = useState("100");
  const [leverage, setLeverage] = useState(5);
  const [side, setSide] = useState<"long" | "short">("long");

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

  // ----- render -----
  return (
    <div className="mx-auto max-w-5xl px-5 py-10">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.22em] text-amber">── Testnet app</p>
          <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">Trade</h1>
        </div>
        <ConnectButton />
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

      {/* Stats */}
      <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Mark price" value={`$${fmtUsd(markPrice as bigint)}`} accent="text-ink" />
        <Stat label="Index (oracle)" value={`$${fmtUsd(indexPrice as bigint)}`} accent="text-ink-soft" />
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

      {!isConnected ? (
        <div className="rounded-xl border border-line bg-panel p-8 text-center text-ink-soft">
          Connect a wallet to start trading on testnet.
        </div>
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
                <h2 className="mb-4 text-sm font-semibold uppercase tracking-wider text-ink-soft">
                  Your position
                </h2>
                <PosRow label="Side" value={pos![0] > 0n ? "Long" : "Short"} />
                <PosRow
                  label={`Size (${market.symbol})`}
                  value={fmtSigned(pos![0] < 0n ? -pos![0] : pos![0], 4)}
                />
                <PosRow label="Notional" value={`$${fmtUsd(pos![1])}`} />
                <PosRow label="Margin" value={`$${fmtUsd(pos![2])}`} />
                <PosRow
                  label="Unrealized PnL"
                  value={`$${fmtSigned(uPnl as bigint)}`}
                  valueClass={
                    (uPnl as bigint) >= 0n ? "text-green" : "text-wine"
                  }
                />
                <button
                  onClick={close}
                  disabled={!!busy || wrongNetwork}
                  className="mt-4 w-full rounded-lg border border-wine bg-wine/10 px-4 py-2.5 text-sm font-semibold text-wine disabled:opacity-40"
                >
                  {busy === "close" ? "Closing…" : "Close position"}
                </button>
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
                <div className="mb-4 flex justify-between text-xs text-ink-dim">
                  <span>Notional</span>
                  <span className="font-mono">
                    ${(Number(margin || "0") * effLeverage).toLocaleString()}
                  </span>
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

      <CreateMarket />

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
