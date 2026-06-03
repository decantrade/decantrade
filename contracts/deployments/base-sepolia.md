# Decant — Base Sepolia (chain 84532) deployment

Deployed via `script/DeployBaseSepolia.s.sol`. Markets seeded at the live Pyth price.
Explorer: https://sepolia.basescan.org

| Contract | Address |
| --- | --- |
| Test USDC (tUSDC, 6 dec) | `0xD556750FCeD5C6BfB867fb3cDc4F0F709c23adEf` |
| Pyth (Base Sepolia) | `0xA2aa501b19aff244D90cc15a4Cf739D2725B5729` |
| ETH/USD oracle (PythOracle) | `0x1A40C6e5c3ea4bc48fecdA063dA1460cfE55427b` |
| BTC/USD oracle (PythOracle) | `0x5b7CC58876f8ef5913F5f595754b796254B16f7B` |
| ETH/USD market (PerpMarket) | `0xB92951edfeC55296D593be9EA3858337cBc199cc` |
| BTC/USD market (PerpMarket) | `0x1D482BcEfe1a4ECBa59662b76D1265DfCa2A94b1` |
| Deployer / owner / governor | `0x2A2297Ba0a704d165b05D3A8e265700d23efcB16` |
| **MarketFactory** (permissionless) | `0xFdcaF774A34E6a457A43402762727432884e1403` |
| SOL/USD market (created via factory) | `0xFb9a9df405Ffd8BAa9dAd9CC02946CDEFb2e34a7` |

## Permissionless factory (Phase B)

`MarketFactory` lets anyone launch a market: `createPythMarket(priceId, baseReserve, quoteReserve)`
for curated Pyth assets, or `createTwapMarket(pool, baseToken, window, ...)` for any token with a
Uniswap V3 pool (TWAP fallback via `UniswapV3TwapOracle`). The creator picks oracle + seed reserves
(bounded by a depth floor); the factory fixes collateral, applies vetted risk params, and assigns
market ownership to the governor — so a creator can't later swap the oracle or rug.

Demonstrated on-chain: the factory created a **SOL/USD** market seeded at the live Pyth price
(~$76.61), registered it, and set owner = governor with 10x default leverage.

## Live smoke test (ETH market)

deposit 100,000 tUSDC → open 5x long (~$50k notional) → close.

- mark $1921.48 → $2022.78 after the long (reserves 1000 base / 1.9215M quote → 974.64 / 1.9715M)
- index price live from Pyth ≈ $1920.97
- after close: position cleared, reserves + mark reverted to seed
- freeCollateral 99,879.92 (≈ $120 lost: $50 open fee + $50 close fee + ~$20 funding)
- insuranceFund 100 (= the two trading fees)

Feed IDs: ETH/USD `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`,
BTC/USD `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`.
