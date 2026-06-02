import "dotenv/config";
import { defineChain } from "viem";
import { baseSepolia } from "viem/chains";

// Minimal PerpMarket ABI: the events the indexer reads + the views/calls the keeper uses.
export const perpMarketAbi = [
  // ---- events ----
  {
    type: "event",
    name: "Deposited",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Withdrawn",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "amount", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionOpened",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "isLong", type: "bool", indexed: false },
      { name: "margin", type: "uint256", indexed: false },
      { name: "notional", type: "uint256", indexed: false },
      { name: "size", type: "int256", indexed: false },
      { name: "markPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PositionClosed",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "pnl", type: "int256", indexed: false },
      { name: "funding", type: "int256", indexed: false },
      { name: "markPrice", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "Liquidated",
    inputs: [
      { name: "trader", type: "address", indexed: true },
      { name: "liquidator", type: "address", indexed: true },
      { name: "reward", type: "uint256", indexed: false },
      { name: "net", type: "int256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "FundingSettled",
    inputs: [
      { name: "premiumFraction", type: "int256", indexed: false },
      { name: "cumulative", type: "int256", indexed: false },
      { name: "markPrice", type: "uint256", indexed: false },
      { name: "indexPrice", type: "uint256", indexed: false },
    ],
  },
  // ---- views ----
  { type: "function", name: "getMarkPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "getIndexPrice", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "marginRatio",
    stateMutability: "view",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ type: "int256" }],
  },
  { type: "function", name: "maintenanceMarginRatio", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "lastFundingTime", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "fundingInterval", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  {
    type: "function",
    name: "positions",
    stateMutability: "view",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [
      { name: "size", type: "int256" },
      { name: "openNotional", type: "uint256" },
      { name: "margin", type: "uint256" },
      { name: "lastPremium", type: "int256" },
    ],
  },
  // ---- keeper calls ----
  { type: "function", name: "settleFunding", stateMutability: "nonpayable", inputs: [], outputs: [] },
  {
    type: "function",
    name: "liquidate",
    stateMutability: "nonpayable",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [],
  },
] as const;

export type MarketCfg = { key: string; address: `0x${string}` };

function parseMarkets(): MarketCfg[] {
  // MARKETS env: "ETH:0xabc...,BTC:0xdef...". Falls back to the live Base Sepolia markets.
  const raw = process.env.MARKETS?.trim();
  if (raw) {
    return raw.split(",").map((part) => {
      const [key, address] = part.split(":");
      return { key: key.trim(), address: address.trim() as `0x${string}` };
    });
  }
  return [
    { key: "ETH", address: "0xB92951edfeC55296D593be9EA3858337cBc199cc" },
    { key: "BTC", address: "0x1D482BcEfe1a4ECBa59662b76D1265DfCa2A94b1" },
    { key: "SOL", address: "0xFb9a9df405Ffd8BAa9dAd9CC02946CDEFb2e34a7" },
  ];
}

const rpcUrl = process.env.RPC_URL || "https://sepolia.base.org";
const chainId = Number(process.env.CHAIN_ID || baseSepolia.id);

export const config = {
  rpcUrl,
  chainId,
  // For non-default chains (e.g. local anvil) build a minimal chain object.
  chain:
    chainId === baseSepolia.id
      ? baseSepolia
      : defineChain({
          id: chainId,
          name: `chain-${chainId}`,
          nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
          rpcUrls: { default: { http: [rpcUrl] } },
        }),
  markets: parseMarkets(),
  startBlock: BigInt(process.env.START_BLOCK || "42326000"),
  dbPath: process.env.DB_PATH || "./decant-indexer.sqlite",
  apiPort: Number(process.env.API_PORT || 8787),
  // keeper
  keeperPrivateKey: process.env.KEEPER_PRIVATE_KEY as `0x${string}` | undefined,
  pollIntervalMs: Number(process.env.POLL_INTERVAL_MS || 15_000),
  fundingIntervalMs: Number(process.env.FUNDING_INTERVAL_MS || 3_600_000),
  // Public Base RPC caps eth_getLogs at a 2000-block range.
  logChunk: BigInt(process.env.LOG_CHUNK || "2000"),
};
