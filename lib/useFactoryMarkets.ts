"use client";

import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import {
  factoryAbi,
  perpMarketAbi,
  twapOracleAbi,
  erc20Abi,
  type MarketInfo,
  type NetworkConfig,
} from "./decant";

// Discovers markets launched permissionlessly through the MarketFactory.
//
// For each market we read its oracle, then the oracle's `baseToken` (only TWAP
// oracles expose it — Pyth oracles revert, so those are skipped here since they
// are the curated set already listed statically) and that token's ERC20 symbol,
// producing a "<SYM> / USD" label. Curated addresses are filtered out by the
// caller (merge dedupes by address), so this returns the "any token" listings.
export function useFactoryMarkets(network: NetworkConfig): {
  markets: MarketInfo[];
  loading: boolean;
  refetch: () => void;
} {
  const publicClient = usePublicClient({ chainId: network.chainId });
  const [markets, setMarkets] = useState<MarketInfo[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  const factory = network.addresses.factory;
  const enabled = network.hasFactory && !!factory && !!publicClient;

  useEffect(() => {
    if (!enabled || !publicClient || !factory) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const len = (await publicClient.readContract({
          address: factory,
          abi: factoryAbi,
          functionName: "allMarketsLength",
        })) as bigint;
        const n = Number(len);
        if (n === 0) {
          if (!cancelled) setMarkets([]);
          return;
        }

        const addrRes = await publicClient.multicall({
          allowFailure: true,
          contracts: Array.from({ length: n }, (_, i) => ({
            address: factory,
            abi: factoryAbi,
            functionName: "allMarkets",
            args: [BigInt(i)],
          })),
        });
        const marketAddrs = addrRes
          .map((r) => (r.status === "success" ? (r.result as `0x${string}`) : null))
          .filter((a): a is `0x${string}` => !!a);
        if (marketAddrs.length === 0) {
          if (!cancelled) setMarkets([]);
          return;
        }

        const oracleRes = await publicClient.multicall({
          allowFailure: true,
          contracts: marketAddrs.map((m) => ({
            address: m,
            abi: perpMarketAbi,
            functionName: "oracle",
          })),
        });

        // Pair each market with its oracle; only keep ones whose oracle is a
        // TWAP oracle (baseToken() succeeds).
        const withOracle = marketAddrs
          .map((m, i) => ({
            market: m,
            oracle: oracleRes[i]?.status === "success" ? (oracleRes[i].result as `0x${string}`) : null,
          }))
          .filter((x) => !!x.oracle) as { market: `0x${string}`; oracle: `0x${string}` }[];

        const baseRes = await publicClient.multicall({
          allowFailure: true,
          contracts: withOracle.map((x) => ({
            address: x.oracle,
            abi: twapOracleAbi,
            functionName: "baseToken",
          })),
        });

        const twap = withOracle
          .map((x, i) => ({
            ...x,
            baseToken: baseRes[i]?.status === "success" ? (baseRes[i].result as `0x${string}`) : null,
          }))
          .filter((x): x is { market: `0x${string}`; oracle: `0x${string}`; baseToken: `0x${string}` } => !!x.baseToken);

        if (twap.length === 0) {
          if (!cancelled) setMarkets([]);
          return;
        }

        const symRes = await publicClient.multicall({
          allowFailure: true,
          contracts: twap.map((x) => ({
            address: x.baseToken,
            abi: erc20Abi,
            functionName: "symbol",
          })),
        });

        const out: MarketInfo[] = twap.map((x, i) => {
          const sym =
            symRes[i]?.status === "success" && typeof symRes[i].result === "string"
              ? (symRes[i].result as string)
              : `${x.baseToken.slice(0, 6)}…`;
          return {
            label: `${sym} / USD`,
            symbol: sym,
            address: x.market,
            source: "factory" as const,
            baseToken: x.baseToken,
          };
        });
        if (!cancelled) setMarkets(out);
      } catch {
        if (!cancelled) setMarkets([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [enabled, factory, network.chainId, publicClient, nonce]);

  return { markets: enabled ? markets : [], loading, refetch: () => setNonce((x) => x + 1) };
}
