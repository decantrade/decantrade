"use client";

import { useState } from "react";
import {
  parseUnits,
  parseEventLogs,
  isAddress,
  type Abi,
} from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  ADDRESSES,
  DECANT_CHAIN,
  factoryAbi,
  PYTH_FEEDS,
} from "@/lib/decant";

const WAD = 10n ** 18n;
const SCAN = "https://sepolia.basescan.org/address";

type Kind = "pyth" | "twap";

function hexId(s: string): `0x${string}` | null {
  const v = s.trim();
  return /^0x[0-9a-fA-F]{64}$/.test(v) ? (v as `0x${string}`) : null;
}

export function CreateMarket() {
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const { connect, connectors } = useConnect();
  const { switchChain } = useSwitchChain();
  const publicClient = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const wrongNetwork = isConnected && chainId !== DECANT_CHAIN.id;

  const [open, setOpen] = useState(false);
  const [kind, setKind] = useState<Kind>("pyth");
  const [feedSel, setFeedSel] = useState<string>("LINK"); // symbol or "custom"
  const [customId, setCustomId] = useState("");
  const [price, setPrice] = useState("");
  const [depth, setDepth] = useState("10000");
  // TWAP
  const [pool, setPool] = useState("");
  const [baseToken, setBaseToken] = useState("");
  const [twapWindow, setTwapWindow] = useState("1800");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);

  const { data: count, refetch: refCount } = useReadContract({
    address: ADDRESSES.factory,
    abi: factoryAbi as Abi,
    functionName: "allMarketsLength",
    chainId: DECANT_CHAIN.id,
    query: { refetchInterval: 30_000 },
  });

  const priceId =
    feedSel === "custom" ? hexId(customId) : PYTH_FEEDS.find((f) => f.symbol === feedSel)?.priceId ?? null;

  let baseReserve = 0n;
  let quoteReserve = 0n;
  try {
    baseReserve = parseUnits(depth || "0", 18);
    const p = parseUnits(price || "0", 18);
    quoteReserve = (baseReserve * p) / WAD;
  } catch {
    baseReserve = 0n;
    quoteReserve = 0n;
  }

  const poolOk = isAddress(pool);
  const baseTokenOk = isAddress(baseToken);
  const windowNum = Number(twapWindow);

  const pythReady = !!priceId && baseReserve > 0n && quoteReserve > 0n;
  const twapReady =
    poolOk && baseTokenOk && windowNum >= 1800 && baseReserve > 0n && quoteReserve > 0n;
  const ready = kind === "pyth" ? pythReady : twapReady;

  async function launch() {
    if (!isConnected) {
      const c = connectors[0];
      if (c) connect({ connector: c });
      return;
    }
    if (wrongNetwork) {
      switchChain({ chainId: DECANT_CHAIN.id });
      return;
    }
    setError(null);
    setCreated(null);
    setBusy(true);
    try {
      const hash =
        kind === "pyth"
          ? await writeContractAsync({
              address: ADDRESSES.factory,
              abi: factoryAbi as Abi,
              functionName: "createPythMarket",
              args: [priceId, baseReserve, quoteReserve],
            })
          : await writeContractAsync({
              address: ADDRESSES.factory,
              abi: factoryAbi as Abi,
              functionName: "createTwapMarket",
              args: [
                pool as `0x${string}`,
                baseToken as `0x${string}`,
                windowNum,
                baseReserve,
                quoteReserve,
              ],
            });
      const receipt = await publicClient!.waitForTransactionReceipt({ hash });
      const logs = parseEventLogs({
        abi: factoryAbi,
        eventName: "MarketCreated",
        logs: receipt.logs,
      });
      const addr = logs[0]?.args?.market as string | undefined;
      setCreated(addr ?? hash);
      refCount();
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        /MARKET_EXISTS/.test(msg)
          ? "A market for this feed already exists."
          : msg.split("\n")[0].slice(0, 160),
      );
    } finally {
      setBusy(false);
    }
  }

  const inputCls =
    "w-full rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-sm outline-none focus:border-amber";

  return (
    <div className="mt-4 rounded-xl border border-line bg-panel">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left"
      >
        <div>
          <div className="text-sm font-semibold">Launch a market</div>
          <div className="text-xs text-ink-dim">
            Permissionless · any token · {count !== undefined ? `${count} live` : "factory"}
          </div>
        </div>
        <span className="text-ink-dim">{open ? "–" : "+"}</span>
      </button>

      {open && (
        <div className="border-t border-line-soft px-5 py-5">
          <p className="mb-4 text-xs leading-relaxed text-ink-dim">
            Deploy a new isolated vAMM market through the on-chain factory. You
            pick the oracle and seed price; the factory locks collateral, risk
            params and ownership. Testnet only.{" "}
            <a href="/docs" className="text-amber hover:opacity-80">
              How it works ↗
            </a>
          </p>

          {/* kind toggle */}
          <div className="mb-4 grid grid-cols-2 gap-2">
            {(["pyth", "twap"] as Kind[]).map((k) => (
              <button
                key={k}
                onClick={() => setKind(k)}
                className={`rounded-lg border px-3 py-2 text-xs font-medium ${
                  kind === k
                    ? "border-amber text-amber"
                    : "border-line text-ink-soft hover:border-line-soft"
                }`}
              >
                {k === "pyth" ? "Pyth feed" : "Uniswap V3 TWAP"}
              </button>
            ))}
          </div>

          {kind === "pyth" ? (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-dim">Price feed</span>
                <select
                  value={feedSel}
                  onChange={(e) => setFeedSel(e.target.value)}
                  className={inputCls}
                >
                  {PYTH_FEEDS.map((f) => (
                    <option key={f.symbol} value={f.symbol}>
                      {f.label}
                    </option>
                  ))}
                  <option value="custom">Custom price ID…</option>
                </select>
              </label>
              {feedSel === "custom" && (
                <label className="block">
                  <span className="mb-1 block text-xs text-ink-dim">
                    Pyth price ID (bytes32)
                  </span>
                  <input
                    value={customId}
                    onChange={(e) => setCustomId(e.target.value)}
                    placeholder="0x…"
                    className={inputCls}
                  />
                  {customId && !hexId(customId) && (
                    <span className="mt-1 block text-xs text-rose-400">
                      Must be 0x + 64 hex chars
                    </span>
                  )}
                </label>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs text-ink-dim">
                  Uniswap V3 pool address
                </span>
                <input
                  value={pool}
                  onChange={(e) => setPool(e.target.value)}
                  placeholder="0x…"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-dim">
                  Base token address
                </span>
                <input
                  value={baseToken}
                  onChange={(e) => setBaseToken(e.target.value)}
                  placeholder="0x…"
                  className={inputCls}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs text-ink-dim">
                  TWAP window (seconds, ≥ 1800)
                </span>
                <input
                  value={twapWindow}
                  onChange={(e) => setTwapWindow(e.target.value)}
                  inputMode="numeric"
                  className={inputCls}
                />
              </label>
            </div>
          )}

          {/* seed */}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-ink-dim">
                Initial price (USD)
              </span>
              <input
                value={price}
                onChange={(e) => setPrice(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs text-ink-dim">
                Base depth (tokens)
              </span>
              <input
                value={depth}
                onChange={(e) => setDepth(e.target.value)}
                inputMode="decimal"
                className={inputCls}
              />
            </label>
          </div>

          <p className="mt-3 text-xs text-ink-dim">
            Seeds the vAMM with{" "}
            <span className="font-mono text-ink-soft">{depth || "0"}</span> virtual
            tokens vs{" "}
            <span className="font-mono text-ink-soft">
              {quoteReserve > 0n
                ? Number(quoteReserve / WAD).toLocaleString()
                : "0"}
            </span>{" "}
            quote → mark ≈ ${price || "0"}.
          </p>

          {error && (
            <div className="mt-3 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
              {error}
            </div>
          )}
          {created && (
            <div className="mt-3 rounded-lg border border-amber/40 bg-amber/10 px-3 py-2 text-xs text-amber">
              Market created!{" "}
              {created.startsWith("0x") && created.length === 42 ? (
                <a
                  href={`${SCAN}/${created}`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono underline"
                >
                  {created}
                </a>
              ) : (
                <span className="font-mono">tx {created.slice(0, 10)}…</span>
              )}
            </div>
          )}

          <button
            onClick={launch}
            disabled={busy || (isConnected && !wrongNetwork && !ready)}
            className="mt-4 w-full rounded-lg bg-amber px-4 py-2.5 text-sm font-semibold text-bg disabled:opacity-40"
          >
            {busy
              ? "Launching…"
              : !isConnected
                ? "Connect wallet to launch"
                : wrongNetwork
                  ? "Switch to Base Sepolia"
                  : "Launch market"}
          </button>
        </div>
      )}
    </div>
  );
}
