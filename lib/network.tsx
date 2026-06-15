"use client";

import { createContext, useContext, type ReactNode } from "react";
import { NETWORKS, type NetworkConfig, type NetworkId } from "./decant";

type NetworkContextValue = {
  networkId: NetworkId;
  network: NetworkConfig;
};

const NetworkContext = createContext<NetworkContextValue | null>(null);

// The /trade app is mainnet-only — the testnet UI has been removed.
export function NetworkProvider({ children }: { children: ReactNode }) {
  const networkId: NetworkId = "mainnet";

  return (
    <NetworkContext.Provider value={{ networkId, network: NETWORKS[networkId] }}>
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork(): NetworkContextValue {
  const ctx = useContext(NetworkContext);
  if (!ctx) throw new Error("useNetwork must be used within a NetworkProvider");
  return ctx;
}
