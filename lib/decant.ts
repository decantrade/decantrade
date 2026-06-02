import { baseSepolia } from "viem/chains";

// Decant MVP deployment on Base Sepolia (testnet). See decant-contracts/deployments.
export const DECANT_CHAIN = baseSepolia;

export const ADDRESSES = {
  usdc: "0xD556750FCeD5C6BfB867fb3cDc4F0F709c23adEf",
  factory: "0xFdcaF774A34E6a457A43402762727432884e1403",
} as const;

export type MarketKey = "ETH" | "BTC";

export const MARKETS: Record<
  MarketKey,
  { label: string; symbol: string; address: `0x${string}` }
> = {
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
};

export const USDC_DECIMALS = 6;

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
] as const;
