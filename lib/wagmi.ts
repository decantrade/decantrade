import { http, cookieStorage, createConfig, createStorage } from "wagmi";
import { base, baseSepolia } from "viem/chains";
import { coinbaseWallet, injected } from "wagmi/connectors";

// Decant runs on Base. The marketing site targets Base mainnet; the live testnet
// trading app (/trade) targets Base Sepolia. Only the lightweight injected +
// Coinbase connectors are bundled here so the server worker stays small.
// WalletConnect (a large SDK that needs indexedDB and can't run during SSR) is
// loaded lazily on the client and registered at runtime — see
// `connectWalletConnect` below — when NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID is set.
export const WALLETCONNECT_PROJECT_ID =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID;

export function getConfig() {
  return createConfig({
    chains: [base, baseSepolia],
    connectors: [
      injected(),
      coinbaseWallet({ appName: "Decant", preference: "all" }),
    ],
    storage: createStorage({ storage: cookieStorage }),
    ssr: true,
    transports: {
      [base.id]: http(),
      [baseSepolia.id]: http(),
    },
  });
}

declare module "wagmi" {
  interface Register {
    config: ReturnType<typeof getConfig>;
  }
}
