"use client";

import { useEffect, useState } from "react";
import {
  formatUnits,
  isAddress,
  parseUnits,
  decodeEventLog,
  type Abi,
} from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import {
  USDC_DECIMALS,
  erc20Abi,
  factoryAbi,
  uniV3PoolAbi,
  uniV3FactoryAbi,
  type NetworkConfig,
} from "@/lib/decant";

// USD-per-base-token derived from a Uniswap V3 tick.
// human price token1/token0 = 1.0001^tick * 10^(dec0 - dec1)
function priceFromTick(tick: number, baseIsToken0: boolean, dec0: number, dec1: number): number {
  const p = Math.pow(1.0001, tick) * Math.pow(10, dec0 - dec1);
  return baseIsToken0 ? p : p === 0 ? 0 : 1 / p;
}

type FactoryCfg = {
  univ3Factory: `0x${string}`;
  minTwapWindow: number;
  minBaseReserve: bigint;
  minPoolLiquidity: bigint;
  twapMaxLeverage: bigint;
  minCreatorInsurance: bigint;
  launchFee: bigint;
};

type PoolInfo = {
  baseToken: `0x${string}`;
  baseSymbol: string;
  baseIsToken0: boolean;
  fee: number;
  liquidity: bigint;
  price: number; // USD per base token
  canonical: boolean;
};

export function LaunchMarket({
  network,
  onClose,
  onLaunched,
}: {
  network: NetworkConfig;
  onClose: () => void;
  onLaunched: (market?: `0x${string}`) => void;
}) {
  const { address, isConnected } = useAccount();
  const publicClient = usePublicClient({ chainId: network.chainId });
  const { writeContractAsync } = useWriteContract();

  const factory = network.addresses.factory;
  const usdc = network.addresses.usdc;

  const [cfg, setCfg] = useState<FactoryCfg | null>(null);
  const [poolAddr, setPoolAddr] = useState("");
  const [twapWindow, setTwapWindow] = useState(1800);
  const [depthUsd, setDepthUsd] = useState("1000");
  const [insurance, setInsurance] = useState("0");
  const [pool, setPool] = useState<PoolInfo | null>(null);
  const [checking, setChecking] = useState(false);
  const [poolError, setPoolError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Load factory guard config once.
  useEffect(() => {
    if (!factory || !publicClient) return;
    let cancelled = false;
    (async () => {
      try {
        const r = await publicClient.multicall({
          allowFailure: false,
          contracts: [
            { address: factory, abi: factoryAbi, functionName: "univ3Factory" },
            { address: factory, abi: factoryAbi, functionName: "minTwapWindow" },
            { address: factory, abi: factoryAbi, functionName: "minBaseReserve" },
            { address: factory, abi: factoryAbi, functionName: "minPoolLiquidity" },
            { address: factory, abi: factoryAbi, functionName: "twapMaxLeverage" },
            { address: factory, abi: factoryAbi, functionName: "minCreatorInsurance" },
            { address: factory, abi: factoryAbi, functionName: "launchFee" },
          ],
        });
        if (cancelled) return;
        const next: FactoryCfg = {
          univ3Factory: r[0] as `0x${string}`,
          minTwapWindow: Number(r[1] as number),
          minBaseReserve: r[2] as bigint,
          minPoolLiquidity: r[3] as bigint,
          twapMaxLeverage: r[4] as bigint,
          minCreatorInsurance: r[5] as bigint,
          launchFee: r[6] as bigint,
        };
        setCfg(next);
        setTwapWindow(Math.max(next.minTwapWindow, 1800));
        setInsurance(formatUnits(next.minCreatorInsurance, USDC_DECIMALS));
      } catch {
        if (!cancelled) setError("Could not read factory config — wrong network?");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [factory, publicClient]);

  // Inspect a pool address and pre-validate it the same way the contract does.
  async function checkPool() {
    setPool(null);
    setPoolError(null);
    if (!publicClient || !cfg) return;
    const addr = poolAddr.trim();
    if (!isAddress(addr)) {
      setPoolError("Enter a valid pool address.");
      return;
    }
    setChecking(true);
    try {
      const [t0, t1, fee, liquidity, slot0] = await publicClient.multicall({
        allowFailure: false,
        contracts: [
          { address: addr as `0x${string}`, abi: uniV3PoolAbi, functionName: "token0" },
          { address: addr as `0x${string}`, abi: uniV3PoolAbi, functionName: "token1" },
          { address: addr as `0x${string}`, abi: uniV3PoolAbi, functionName: "fee" },
          { address: addr as `0x${string}`, abi: uniV3PoolAbi, functionName: "liquidity" },
          { address: addr as `0x${string}`, abi: uniV3PoolAbi, functionName: "slot0" },
        ],
      });
      const token0 = t0 as `0x${string}`;
      const token1 = t1 as `0x${string}`;
      const feeN = Number(fee as number);
      const usdcLc = usdc.toLowerCase();
      const t0IsUsdc = token0.toLowerCase() === usdcLc;
      const t1IsUsdc = token1.toLowerCase() === usdcLc;
      if (!t0IsUsdc && !t1IsUsdc) {
        setPoolError(`Pool must be paired with ${network.collateralLabel} (USDC). This pool isn't.`);
        return;
      }
      const baseToken = (t0IsUsdc ? token1 : token0) as `0x${string}`;
      const baseIsToken0 = !t0IsUsdc;
      const tick = Number((slot0 as readonly unknown[])[1] as number);

      // base token symbol + decimals, and canonical check via the real factory.
      const [sym, dec, canonicalPool, usdcDec] = await publicClient.multicall({
        allowFailure: true,
        contracts: [
          { address: baseToken, abi: erc20Abi, functionName: "symbol" },
          { address: baseToken, abi: erc20Abi, functionName: "decimals" },
          {
            address: cfg.univ3Factory,
            abi: uniV3FactoryAbi,
            functionName: "getPool",
            args: [token0, token1, feeN],
          },
          { address: usdc, abi: erc20Abi, functionName: "decimals" },
        ],
      });
      const baseDecimals = dec.status === "success" ? Number(dec.result as number) : 18;
      const usdcDecimals = usdcDec.status === "success" ? Number(usdcDec.result as number) : USDC_DECIMALS;
      const dec0 = baseIsToken0 ? baseDecimals : usdcDecimals;
      const dec1 = baseIsToken0 ? usdcDecimals : baseDecimals;
      const price = priceFromTick(tick, baseIsToken0, dec0, dec1);
      const canonical =
        canonicalPool.status === "success" &&
        (canonicalPool.result as string).toLowerCase() === addr.toLowerCase();

      setPool({
        baseToken,
        baseSymbol: sym.status === "success" ? (sym.result as string) : `${baseToken.slice(0, 6)}…`,
        baseIsToken0,
        fee: feeN,
        liquidity: liquidity as bigint,
        price,
        canonical,
      });
    } catch {
      setPoolError("Couldn't read this pool. Is the address a Uniswap V3 pool on this network?");
    } finally {
      setChecking(false);
    }
  }

  // Derived reserves (mark == pool price, so it sits inside the ±20% band).
  let baseReserveWad = 0n;
  let quoteReserveWad = 0n;
  let depthOk = false;
  try {
    const depth = parseFloat(depthUsd || "0");
    if (depth > 0 && pool && pool.price > 0) {
      quoteReserveWad = parseUnits(depthUsd, 18);
      const baseTokens = depth / pool.price;
      baseReserveWad = parseUnits(baseTokens.toFixed(18), 18);
      depthOk = true;
    }
  } catch {
    depthOk = false;
  }

  let insuranceWad = 0n;
  try {
    insuranceWad = parseUnits(insurance || "0", USDC_DECIMALS);
  } catch {
    insuranceWad = 0n;
  }

  const usdcNeeded = (cfg?.launchFee ?? 0n) + (cfg ? (insuranceWad > cfg.minCreatorInsurance ? insuranceWad : cfg.minCreatorInsurance) : 0n);

  // Client-side mirror of the contract guards, for friendly inline messaging.
  const checks: { ok: boolean; label: string }[] = cfg && pool
    ? [
        { ok: pool.canonical, label: "Pool is a canonical Uniswap V3 pool (G1)" },
        { ok: true, label: `Paired with ${network.collateralLabel} (G2)` },
        { ok: pool.liquidity >= cfg.minPoolLiquidity, label: "Pool liquidity above floor (G3)" },
        { ok: twapWindow >= cfg.minTwapWindow, label: `TWAP window ≥ ${cfg.minTwapWindow}s (G4)` },
        { ok: depthOk && baseReserveWad >= cfg.minBaseReserve, label: "Seed reserves above minimum" },
      ]
    : [];
  const allOk = checks.length > 0 && checks.every((c) => c.ok);

  async function launch() {
    if (!publicClient || !factory || !cfg || !pool || !address) return;
    setError(null);
    try {
      // Approve USDC for the factory (launch fee + creator insurance) if needed.
      if (usdcNeeded > 0n) {
        const allowance = (await publicClient.readContract({
          address: usdc,
          abi: erc20Abi,
          functionName: "allowance",
          args: [address, factory],
        })) as bigint;
        if (allowance < usdcNeeded) {
          setBusy("approve");
          const aHash = await writeContractAsync({
            address: usdc,
            abi: erc20Abi as Abi,
            functionName: "approve",
            args: [factory, usdcNeeded],
          });
          await publicClient.waitForTransactionReceipt({ hash: aHash });
        }
      }

      setBusy("launch");
      const hash = await writeContractAsync({
        address: factory,
        abi: factoryAbi as Abi,
        functionName: "createTwapMarket",
        args: [poolAddr.trim() as `0x${string}`, pool.baseToken, twapWindow, baseReserveWad, quoteReserveWad],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });

      // Pull the new market address out of the MarketCreated event.
      let created: `0x${string}` | undefined;
      for (const log of receipt.logs) {
        try {
          const ev = decodeEventLog({ abi: factoryAbi, data: log.data, topics: log.topics });
          if (ev.eventName === "MarketCreated") {
            created = (ev.args as { market: `0x${string}` }).market;
            break;
          }
        } catch {
          // not our event
        }
      }
      onLaunched(created);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg.split("\n")[0].slice(0, 180));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 p-4 sm:p-8">
      <div className="w-full max-w-lg rounded-2xl border border-line bg-panel p-5 shadow-xl">
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-semibold text-ink">Launch a market</h2>
            <p className="mt-0.5 text-xs text-ink-dim">
              Open a perp on any token with a Uniswap V3 / USDC pool. Guarded: canonical pool,
              liquidity floor, {cfg ? `${Number(formatUnits(cfg.twapMaxLeverage, 18))}×` : "low"} leverage,
              isolated insurance.
            </p>
          </div>
          <button onClick={onClose} className="ml-3 text-ink-dim hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        {!isConnected && (
          <div className="mb-4 rounded-lg border border-amber bg-amber/10 px-3 py-2 text-sm text-amber">
            Connect your wallet to launch a market.
          </div>
        )}

        {/* Pool address */}
        <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-soft">
          Uniswap V3 pool address
        </label>
        <div className="mb-1 flex gap-2">
          <input
            value={poolAddr}
            onChange={(e) => setPoolAddr(e.target.value)}
            placeholder="0x… token/USDC pool"
            className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2 font-mono text-sm text-ink outline-none focus:border-amber"
          />
          <button
            onClick={checkPool}
            disabled={checking || !cfg}
            className="shrink-0 rounded-lg border border-line px-3 py-2 text-sm text-ink-soft hover:border-ink-dim disabled:opacity-50"
          >
            {checking ? "Checking…" : "Check"}
          </button>
        </div>
        {poolError && <p className="mb-2 text-xs text-wine">{poolError}</p>}

        {pool && cfg && (
          <div className="mb-4 mt-2 rounded-lg border border-line bg-bg p-3 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-semibold text-ink">{pool.baseSymbol} / USD</span>
              <span className="text-ink-soft">≈ ${pool.price.toLocaleString(undefined, { maximumSignificantDigits: 6 })}</span>
            </div>
            <ul className="space-y-1">
              {checks.map((c) => (
                <li key={c.label} className={c.ok ? "text-green" : "text-wine"}>
                  {c.ok ? "✓" : "✕"} {c.label}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[11px] text-ink-dim">
              Fee tier {pool.fee / 10000}% · liquidity {pool.liquidity.toString()}
            </p>
          </div>
        )}

        {/* Params */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-soft">
              TWAP window (sec)
            </label>
            <input
              type="number"
              value={twapWindow}
              min={cfg?.minTwapWindow ?? 1800}
              onChange={(e) => setTwapWindow(Number(e.target.value))}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-amber"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium uppercase tracking-wider text-ink-soft">
              Initial depth (USD)
            </label>
            <input
              type="number"
              value={depthUsd}
              onChange={(e) => setDepthUsd(e.target.value)}
              className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-amber"
            />
          </div>
        </div>

        {cfg && (cfg.minCreatorInsurance > 0n || cfg.launchFee > 0n) && (
          <div className="mb-4 rounded-lg border border-line bg-bg p-3 text-xs text-ink-soft">
            {cfg.launchFee > 0n && (
              <div className="flex justify-between">
                <span>Launch fee (anti-spam)</span>
                <span className="text-ink">${formatUnits(cfg.launchFee, USDC_DECIMALS)}</span>
              </div>
            )}
            {cfg.minCreatorInsurance > 0n && (
              <div className="mt-1">
                <label className="mb-1 block">Creator insurance (min ${formatUnits(cfg.minCreatorInsurance, USDC_DECIMALS)}, isolated)</label>
                <input
                  type="number"
                  value={insurance}
                  onChange={(e) => setInsurance(e.target.value)}
                  className="w-full rounded-lg border border-line bg-panel px-3 py-2 text-sm text-ink outline-none focus:border-amber"
                />
              </div>
            )}
            <div className="mt-2 flex justify-between border-t border-line pt-2 text-ink">
              <span>Total {network.collateralLabel} needed</span>
              <span>${formatUnits(usdcNeeded, USDC_DECIMALS)}</span>
            </div>
          </div>
        )}

        {error && (
          <p className="mb-3 break-words rounded-lg border border-wine/40 bg-wine/10 px-3 py-2 text-xs text-wine">
            {error}
          </p>
        )}

        <button
          onClick={launch}
          disabled={!isConnected || !allOk || !!busy || !depthOk}
          className="w-full rounded-lg bg-amber px-4 py-3 text-sm font-semibold text-black transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {busy === "approve"
            ? "Approve USDC…"
            : busy === "launch"
              ? "Launching market…"
              : "Launch market"}
        </button>
        <p className="mt-2 text-center text-[11px] text-ink-dim">
          Anyone can launch. Guardrails are enforced on-chain — thin or fake pools are rejected.
        </p>
      </div>
    </div>
  );
}
