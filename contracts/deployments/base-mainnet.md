# Decant — Base mainnet (chain 8453) deployment — GUARDED BETA

Deployed via `script/DeployBaseMainnetIndexPnl.s.sol` (ETH/USD + BTC/USD +
SOL/USD). **Unaudited.** Holder-gated ($DECANT) with small per-wallet and
open-interest caps and reduced leverage. Each market seeds its vAMM at the live
Pyth price so mark ≈ index at launch. Explorer: https://basescan.org

> **Redeployed** to switch PnL/sizing to oracle-priced (index-based) PnL: PnL =
> size × (oracle price − entry oracle price), so profit tracks the real asset
> price instead of the vAMM mark. Funding (mark vs index) is unchanged. New
> addresses below; the previous markets are abandoned (their locked state,
> incl. the prior insurance, stays there). New markets start with $0 insurance.

| Contract | Address |
| --- | --- |
| USDC (collateral, 6 dec) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Pyth (Base mainnet) | `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` |
| ETH/USD oracle (PythOracle) | `0x531346F4f474280920a565325cD4e7bB51171e84` |
| ETH/USD market (PerpMarket) | `0x2A984D3e130e1Ee50c7A16E9875F874665eF3e77` |
| BTC/USD oracle (PythOracle) | `0x7EBA869FB52cF4FC80653747fA93D1eD24F0E086` |
| BTC/USD market (PerpMarket) | `0x1FD1CefceD2090597A45bc73baF53617917c645A` |
| SOL/USD oracle (PythOracle) | `0x23D62ED89FCB09c9c434Aeb01fa44011d5824fDB` |
| SOL/USD market (PerpMarket) | `0xb9E9CDDd0C94197724EABc9620ee93E9C63F857b` |
| $DECANT (gate token, 18 dec) | `0x10feE05Ef916625FD86b2fED432e325bE897BBa3` |
| Deployer / current owner | `0xC5e1d8AC5aECb1dB7C04f9f7A8d7C08A8824720C` |

## Guarded-launch configuration (verified on-chain)

| Param | Value |
| --- | --- |
| Holder gate (min $DECANT) | 50,000,000 DECANT (`gateMinBalance = 50e24`) |
| Max deposit / wallet | $200 (`maxDepositPerWallet = 200e18`) |
| Max open interest | $2,000 (`maxOpenInterest = 2000e18`) |
| Max leverage | 10x (`maxLeverage = 10e18`) |
| Paused | false |
| Seed price ETH (mark = index) | ~$1,827.72 |
| Seed price BTC (mark = index) | ~$66,824.92 |
| Seed price SOL (mark = index) | ~$75.19 |

The same guard config (gate / caps / leverage) is applied to all three markets.
The trading wallet `0xc1CdDE11b0ed6b5fd0c0805B6B829310bbC16825` is allowlisted on
all three.

Access: a wallet may `deposit` / `openPosition` only if it is on the `allowlist`
or holds ≥ `gateMinBalance` of $DECANT. `closePosition` and `withdraw` are never
gated or pausable, so funds can always exit.

## Outstanding before public use

- [ ] `transferOwnership` from the hot deployer EOA to a multisig/Safe.
- [ ] Seed the insurance fund (`addInsurance`) with USDC on the new markets
      (start $0; prior insurance is stranded on the abandoned markets).
- [ ] Run the keeper (liquidation + funding) against chain 8453 + this market.
- [ ] Audit before raising caps / leverage or removing the gate.

Pyth feed IDs:
- ETH/USD `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
- BTC/USD `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
- SOL/USD `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`
