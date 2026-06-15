import { base, baseSepolia } from "viem/chains";
import type { Chain } from "viem";

// Decant MVP deployment on Base Sepolia (testnet). See decant-contracts/deployments.
export const DECANT_CHAIN = baseSepolia;

export const ADDRESSES = {
  usdc: "0xD556750FCeD5C6BfB867fb3cDc4F0F709c23adEf",
  factory: "0xFdcaF774A34E6a457A43402762727432884e1403",
} as const;

export type MarketKey = "ETH" | "BTC" | "SOL" | "SPCX";

export type MarketInfo = {
  label: string;
  symbol: string;
  address: `0x${string}`;
  // "factory" = permissionlessly launched via MarketFactory (discovered at runtime).
  source?: "curated" | "factory";
  baseToken?: `0x${string}`;
};

export const MARKETS: Record<MarketKey, MarketInfo> = {
  ETH: {
    label: "ETH / USD",
    symbol: "ETH",
    address: "0xB92951edfeC55296D593be9EA3858337cBc199cc",
  },
  BTC: {
    label: "BTC / USD",
    symbol: "BTC",
    address: "0x1D482BcEfe1a4ECBa59662b76D1265DfCa2A94b1",
  },
  SOL: {
    label: "SOL / USD",
    symbol: "SOL",
    address: "0xFb9a9df405Ffd8BAa9dAd9CC02946CDEFb2e34a7",
  },
  SPCX: {
    label: "SPCX / USD",
    symbol: "SPCX",
    address: "0x4e65a31d3A1ee088492bb3CE3E8CA3AD7C37Cd30",
  },
};

export const USDC_DECIMALS = 6;

// Public keeper + indexer worker (activity feed, leaderboard). Overridable via env.
export const KEEPER_API =
  process.env.NEXT_PUBLIC_KEEPER_API || "https://decant-keeper.decantrade.workers.dev";

// ----- Networks -----
// The /trade app can target either the public Base Sepolia testnet (default,
// faucet + permissionless market creation) or the guarded Base mainnet beta
// (real USDC, holder-gated + capped, single ETH/USD market). The active network
// is chosen at runtime via the toggle in the UI — see lib/network.tsx.
export type NetworkId = "testnet" | "mainnet";

// The chain ids configured in wagmi (see lib/wagmi.ts). wagmi types `chainId`
// params as this literal union, so config calls must use it (not plain number).
export type DecantChainId = typeof base.id | typeof baseSepolia.id;

export type NetworkConfig = {
  id: NetworkId;
  label: string;
  chain: Chain;
  chainId: DecantChainId;
  addresses: { usdc: `0x${string}`; factory?: `0x${string}` };
  markets: Partial<Record<MarketKey, MarketInfo>>;
  keeperApi: string;
  explorer: string;
  collateralLabel: string;
  hasFaucet: boolean;
  hasFactory: boolean;
  guarded: boolean;
};

export const NETWORKS: Record<NetworkId, NetworkConfig> = {
  testnet: {
    id: "testnet",
    label: "Testnet",
    chain: baseSepolia,
    chainId: baseSepolia.id,
    addresses: ADDRESSES,
    markets: MARKETS,
    keeperApi: KEEPER_API,
    explorer: "https://sepolia.basescan.org",
    collateralLabel: "tUSDC",
    hasFaucet: true,
    hasFactory: true,
    guarded: false,
  },
  mainnet: {
    id: "mainnet",
    label: "Mainnet",
    chain: base,
    chainId: base.id,
    // Real Base mainnet USDC (Circle). No permissionless factory on mainnet yet.
    addresses: { usdc: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" },
    // Guarded ETH/BTC/SOL markets — see contracts/deployments/base-mainnet.md.
    markets: {
      ETH: {
        label: "ETH / USD",
        symbol: "ETH",
        address: "0x2A984D3e130e1Ee50c7A16E9875F874665eF3e77",
      },
      BTC: {
        label: "BTC / USD",
        symbol: "BTC",
        address: "0x1FD1CefceD2090597A45bc73baF53617917c645A",
      },
      SOL: {
        label: "SOL / USD",
        symbol: "SOL",
        address: "0xb9E9CDDd0C94197724EABc9620ee93E9C63F857b",
      },
    },
    keeperApi:
      process.env.NEXT_PUBLIC_KEEPER_API_MAINNET ||
      "https://decant-keeper-mainnet.decantrade.workers.dev",
    explorer: "https://basescan.org",
    collateralLabel: "USDC",
    hasFaucet: false,
    hasFactory: false,
    guarded: true,
  },
};

// ----- ABIs (only the methods the UI uses) -----

export const erc20Abi = [
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [
      { name: "owner", type: "address" },
      { name: "spender", type: "address" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [
      { name: "spender", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "mint",
    stateMutability: "nonpayable",
    inputs: [
      { name: "to", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
] as const;

// Uniswap V3 TWAP oracle — used to derive a discovered market's base token + price.
export const twapOracleAbi = [
  {
    type: "function",
    name: "baseToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "pool",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "twapWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "getPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

// Minimal Uniswap V3 pool surface for client-side pre-validation of a launch.
export const uniV3PoolAbi = [
  { type: "function", name: "token0", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "token1", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "fee", stateMutability: "view", inputs: [], outputs: [{ type: "uint24" }] },
  { type: "function", name: "liquidity", stateMutability: "view", inputs: [], outputs: [{ type: "uint128" }] },
  {
    type: "function",
    name: "slot0",
    stateMutability: "view",
    inputs: [],
    outputs: [
      { name: "sqrtPriceX96", type: "uint160" },
      { name: "tick", type: "int24" },
      { name: "observationIndex", type: "uint16" },
      { name: "observationCardinality", type: "uint16" },
      { name: "observationCardinalityNext", type: "uint16" },
      { name: "feeProtocol", type: "uint8" },
      { name: "unlocked", type: "bool" },
    ],
  },
] as const;

// Canonical Uniswap V3 factory (getPool) — used to pre-validate a launch the
// same way MarketFactory's on-chain G1 check does.
export const uniV3FactoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [
      { name: "tokenA", type: "address" },
      { name: "tokenB", type: "address" },
      { name: "fee", type: "uint24" },
    ],
    outputs: [{ type: "address" }],
  },
] as const;

export const perpMarketAbi = [
  {
    type: "function",
    name: "getMarkPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getIndexPrice",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "maxLeverage",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "maintenanceMarginRatio",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tradingFeeRatio",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "cumulativePremiumFraction",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "int256" }],
  },
  {
    type: "function",
    name: "lastFundingTime",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "fundingInterval",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "baseReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "quoteReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "freeCollateral",
    stateMutability: "view",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "unrealizedPnl",
    stateMutability: "view",
    inputs: [{ name: "trader", type: "address" }],
    outputs: [{ type: "int256" }],
  },
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
      { name: "entryPrice", type: "uint256" },
    ],
  },
  {
    type: "function",
    name: "deposit",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "openPosition",
    stateMutability: "nonpayable",
    inputs: [
      { name: "isLong", type: "bool" },
      { name: "marginAmount", type: "uint256" },
      { name: "leverage", type: "uint256" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "closePosition",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "closePartial",
    stateMutability: "nonpayable",
    inputs: [{ name: "fraction", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "addMargin",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "removeMargin",
    stateMutability: "nonpayable",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [],
  },
  // Access gate (guarded beta): callers must be allowlisted or hold
  // >= gateMinBalance of gateToken to deposit / open.
  {
    type: "function",
    name: "allowlist",
    stateMutability: "view",
    inputs: [{ name: "account", type: "address" }],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "gateToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "gateMinBalance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "oracle",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "maxOpenInterest",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

// MarketFactory — permissionless launcher (createPythMarket / createTwapMarket).
export const factoryAbi = [
  {
    type: "function",
    name: "allMarketsLength",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allMarkets",
    stateMutability: "view",
    inputs: [{ name: "index", type: "uint256" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "minBaseReserve",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "minTwapWindow",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "univ3Factory",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "minPoolLiquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
  {
    type: "function",
    name: "twapMaxLeverage",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "minCreatorInsurance",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "launchFee",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "marketForKey",
    stateMutability: "view",
    inputs: [{ name: "key", type: "bytes32" }],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "createPythMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "priceId", type: "bytes32" },
      { name: "baseReserve", type: "uint256" },
      { name: "quoteReserve", type: "uint256" },
    ],
    outputs: [{ name: "market", type: "address" }],
  },
  {
    type: "function",
    name: "createTwapMarket",
    stateMutability: "nonpayable",
    inputs: [
      { name: "pool", type: "address" },
      { name: "baseToken", type: "address" },
      { name: "twapWindow", type: "uint32" },
      { name: "baseReserve", type: "uint256" },
      { name: "quoteReserve", type: "uint256" },
    ],
    outputs: [{ name: "market", type: "address" }],
  },
  {
    type: "event",
    name: "MarketCreated",
    inputs: [
      { name: "market", type: "address", indexed: true },
      { name: "oracle", type: "address", indexed: true },
      { name: "creator", type: "address", indexed: true },
      { name: "kind", type: "uint8", indexed: false },
      { name: "key", type: "bytes32", indexed: false },
      { name: "baseReserve", type: "uint256", indexed: false },
      { name: "quoteReserve", type: "uint256", indexed: false },
    ],
  },
] as const;

// Curated Pyth price-feed IDs (chain-agnostic). ETH/BTC/SOL already have live
// markets; the rest are offered as ready-to-launch presets.
export type PythFeed = { symbol: string; label: string; priceId: `0x${string}` };

export const PYTH_FEEDS: PythFeed[] = [
  { symbol: "ETH", label: "ETH / USD", priceId: "0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace" },
  { symbol: "BTC", label: "BTC / USD", priceId: "0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43" },
  { symbol: "SOL", label: "SOL / USD", priceId: "0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d" },
  { symbol: "LINK", label: "LINK / USD", priceId: "0x8ac0c70fff57e9aefdf5edf44b51d62c2d433653cbb2cf5cc06bb115af04d221" },
  { symbol: "ARB", label: "ARB / USD", priceId: "0x3fa4252848f9f0a1480be62745a4629d9eb1322aebab8a791e344b3b9c1adcf5" },
  { symbol: "DOGE", label: "DOGE / USD", priceId: "0xdcef50dd0a4cd2dcc17e45df1676dcb336a11a61c69df7a0299b0150c672d25c" },
  { symbol: "AVAX", label: "AVAX / USD", priceId: "0x93da3352f9f1d105fdfe4971cfa80e9dd777bfc5d0f683ebb6e1294b92137bb7" },
  { symbol: "BNB", label: "BNB / USD", priceId: "0x2f95862b045670cd22bee3114c39763a4a08beeb663b145d283c31d7d1101c4f" },
];
