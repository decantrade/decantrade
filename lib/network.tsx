"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { NETWORKS, type NetworkConfig, type NetworkId } from "./decant";

type NetworkContextValue = {
  networkId: NetworkId;
  network: NetworkConfig;
  setNetworkId: (id: NetworkId) => void;
};

const NetworkContext = createContext<NetworkContextValue | null>(null);
const STORAGE_KEY = "decant.network";

// Defaults to testnet so SSR and the first client render match (the live demo is
// testnet). If the user previously picked mainnet we switch after hydration.
export function NetworkProvider({ children }: { children: ReactNode }) {
  const [networkId, setNetworkIdState] = useState<NetworkId>("testnet");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      // Defer out of the effect body to avoid a synchronous cascading render
      // (and keep SSR/first-paint on the testnet default to avoid hydration drift).
      if (saved === "mainnet" || saved === "testnet") {
        queueMicrotask(() => setNetworkIdState(saved));
      }
    } catch {
      /* ignore */
    }
  }, []);

  const setNetworkId = useCallback((id: NetworkId) => {
    setNetworkIdState(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      /* ignore */
    }
  }, []);

  return (
    <NetworkContext.Provider
      value={{ networkId, network: NETWORKS[networkId], setNetworkId }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within a NetworkProvider");
  return ctx;
}
