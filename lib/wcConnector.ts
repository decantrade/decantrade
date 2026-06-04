// Isolated so the heavy WalletConnect SDK only lands in a client-side lazy
// chunk and never the server worker bundle. A named re-export tree-shakes to
// just the walletConnect connector (avoids pulling the whole wagmi/connectors
// barrel, some of whose connectors reference uninstalled optional peers).
// Loaded via dynamic import from `connectWalletConnect` in ./wagmi.
export { walletConnect } from "wagmi/connectors";
