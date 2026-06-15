# Decant — Base mainnet (chain 8453) deployment — GUARDED BETA

Deployed via `script/DeployBaseMainnetGuarded.s.sol` (ETH/USD) and
`script/DeployBaseMainnetBtcSol.s.sol` (BTC/USD + SOL/USD). **Unaudited.**
Holder-gated ($DECANT) with small per-wallet and open-interest caps and reduced
leverage. Each market seeds its vAMM at the live Pyth price so mark ≈ index at
launch. Explorer: https://basescan.org

> **Redeployed** to add `closePartial` / `addMargin` / `removeMargin` (partial
> close + adjust margin). New addresses below; the previous markets are
> abandoned (their state, incl. the prior $200 insurance on the old ETH market,
> stays locked there). New markets re-seed insurance from scratch.

| Contract | Address |
| --- | --- |
| USDC (collateral, 6 dec) | `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913` |
| Pyth (Base mainnet) | `0x8250f4aF4B972684F7b336503E2D6dFeDeB1487a` |
| ETH/USD oracle (PythOracle) | `0x2d1bd991dae8a6c7d5bfda0e64f4c30bab994868` |
| ETH/USD market (PerpMarket) | `0x97650B15CD4042e29eB3429BF2238cfc272580A7` |
| BTC/USD oracle (PythOracle) | `0xd01a569257809118fec418679da2fbf9664bb5ec` |
| BTC/USD market (PerpMarket) | `0x34ce53a7a0b7cBbe77b4e7CBC43e4EE3bD9879Da` |
| SOL/USD oracle (PythOracle) | `0x1f3b254e3ec56660c720cdb61ad85d426d510aad` |
| SOL/USD market (PerpMarket) | `0x946252cBD614E6831AafD4b4AF4b9e389382bfB4` |
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
| Seed price ETH (mark = index) | ~$1,764.60 |
| Seed price BTC (mark = index) | ~$66,199.68 |
| Seed price SOL (mark = index) | ~$71.83 |

The same guard config (gate / caps / leverage) is applied to all three markets.
The trading wallet `0xc1CdDE11b0ed6b5fd0c0805B6B829310bbC16825` is allowlisted on
all three.

Access: a wallet may `deposit` / `openPosition` only if it is on the `allowlist`
or holds ≥ `gateMinBalance` of $DECANT. `closePosition` and `withdraw` are never
gated or pausable, so funds can always exit.

## Outstanding before public use

- [ ] `transferOwnership` from the hot deployer EOA to a multisig/Safe.
- [ ] Re-seed the insurance fund (`addInsurance`) with USDC on the new ETH market
      (the prior $200 is stranded on the old ETH market).
- [ ] Run the keeper (liquidation + funding) against chain 8453 + this market.
- [ ] Audit before raising caps / leverage or removing the gate.

Pyth feed IDs:
- ETH/USD `0xff61491a931112ddf1bd8147cd1b641375f79f5825126d665480874634fd0ace`
- BTC/USD `0xe62df6c8b4a85fe1a67db44dc12de5db330f7ac66b72dc658afedf0f4a415b43`
- SOL/USD `0xef0d8b6fda2ceba41da15d4095d1da392a0d2f8ed0c6c7bc0f4cfac8c280b56d`
