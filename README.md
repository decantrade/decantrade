<div align="center">

<img src="public/brand/decant-banner.png" alt="Decant — index-priced perpetual futures on Solana" width="100%" />

# Decant

**Index-priced perpetual futures on [Solana](https://solana.com).**
Trade SOL-PERP long or short with leverage — USDC-margined, fully on-chain. PnL settles against a Pyth index price, with isolated margin and a per-market insurance fund.

[decantrade.com](https://decantrade.com) · [@_decantrade](https://x.com/_decantrade)

</div>

---

> **Status:** Guarded launch on **Solana devnet**. This repository contains the marketing
> landing page and the invite-gated waitlist app. The trading protocol runs on a test
> network and uses test USDC with no monetary value. Nothing here is financial advice.
> See [/risk](https://decantrade.com/risk).

## Demo

The trade flow end-to-end: connect a wallet → deposit USDC → open a leveraged position → close & settle, every step a real on-chain transaction. Try it live on **Solana devnet** at [decantrade.com/trade](https://decantrade.com/trade).

[![Watch the Decant trade demo](docs/screenshots/trade.png)](https://github.com/decantrade/decantrade/blob/main/docs/demo.mp4)

▶ **[Watch the demo](https://github.com/decantrade/decantrade/blob/main/docs/demo.mp4)** (39s, earlier testnet recording) — or grab the [raw file](https://github.com/decantrade/decantrade/raw/main/docs/demo.mp4).

## Screenshots

| Landing | Trade terminal (testnet) |
| :---: | :---: |
| [![Decant landing page](docs/screenshots/landing.png)](https://decantrade.com) | [![Decant trade terminal](docs/screenshots/trade.png)](https://decantrade.com/trade) |

## What's in here

This is the **landing + waitlist** application:

- A dark, terminal-styled marketing site for Decant.
- An **invite-only waitlist** gated behind 8-character referral codes.
- Sign up with a **Solana wallet** (Phantom/Solflare — sign-only, gas-free proof of ownership) or an **email**.
- A password-gated **admin dashboard** to view and export signups.
- Deployed to **Cloudflare Workers** via the OpenNext adapter, backed by **Neon Postgres**.

## Features

- **Invite-gated waitlist** — the form stays locked until a valid referral code is entered.
- **Referral mechanics** — every signup mints 3 fresh invite codes (3 uses each) so access spreads virally. Seed codes are issued with 100 uses each.
- **Two join methods** — connect a Solana wallet (Phantom/Solflare) and sign a message, or join with email. Optional X handle.
- **Confirmation email** — email signups get a queue-position + invite-codes email via Resend (optional; skipped when no API key is configured).
- **Anti-bot** — per-IP, database-backed rate limiting plus a honeypot field on the public endpoints.
- **Admin dashboard** — `/admin`, gated by a server-side token, with CSV export of all signups.
- **SEO** — generated `robots.txt` and `sitemap.xml`; the admin route is `noindex`.
- **Legal** — Terms, Privacy, and Risk pages.

## Tech stack

| Layer        | Choice                                                            |
| ------------ | ----------------------------------------------------------------- |
| Framework    | [Next.js 16](https://nextjs.org) (App Router) + React 19          |
| Language     | TypeScript                                                        |
| Styling      | Tailwind CSS, [Motion](https://motion.dev) for animation          |
| Wallet       | [Solana wallet-adapter](https://github.com/anza-xyz/wallet-adapter) + [web3.js](https://solana.com/docs/clients/javascript) + [Anchor](https://www.anchor-lang.com) (Phantom/Solflare, devnet) |
| Database     | PostgreSQL — `postgres` (TCP) locally, [Neon](https://neon.tech) serverless (HTTP) on Workers |
| Hosting      | [Cloudflare Workers](https://workers.cloudflare.com) via [OpenNext](https://opennext.js.org/cloudflare) |
| Package mgr  | pnpm                                                              |

### Dual database driver

`lib/db.ts` lazily selects a driver at runtime so the build never needs a live database:

- **Local dev** → the `postgres` package over TCP.
- **Cloudflare Workers** → `@neondatabase/serverless` over HTTP (TCP sockets aren't available on Workers). Selected when `DB_DRIVER=neon` (set in `wrangler.jsonc`).

## Project structure

```
app/
  (legal)/            Terms, Privacy, Risk pages (route group, shared layout)
  admin/              Password-gated waitlist dashboard (noindex)
  api/
    referral/         POST — validate a referral code
    waitlist/         POST — join the waitlist (wallet or email)
    stats/            GET  — public signup counts
    admin/waitlist/   GET  — full signup list (Bearer token required)
  robots.ts           Generated robots.txt
  sitemap.ts          Generated sitemap.xml
  layout.tsx          Root layout + metadata
  page.tsx            Landing page
components/            Hero, Waitlist, Footer, Header, FAQ, etc.
lib/
  db.ts               Lazy dual-driver SQL client
  referral.ts         Code generation/validation, message builder, validators
  ratelimit.ts        Per-IP fixed-window rate limiter (Postgres-backed)
  solana/             Solana program client (IDL, PDAs, AnchorProvider)
scripts/
  init-db.ts          Creates tables and seeds invite codes
public/brand/         Logo, avatar, OG image, banner
wrangler.jsonc        Cloudflare Worker config (custom domains, vars)
open-next.config.ts   OpenNext Cloudflare adapter config
```

## Getting started (local)

**Prerequisites:** Node.js 20+, pnpm, and a PostgreSQL connection string.

```bash
pnpm install
```

Create a `.dev.vars` file in the project root with your database URL:

```
DATABASE_URL=postgresql://user:pass@host:5432/decant
# Optional — required only to use the admin dashboard locally:
ADMIN_TOKEN=your-long-random-token
```

Initialize the schema and seed invite codes:

```bash
pnpm db:init
```

This creates the `decant_waitlist`, `decant_referral_codes`, and `decant_rate_limit`
tables and prints a batch of seed invite codes (override the count/uses with the
`SEED_COUNT` and `SEED_MAX_USES` env vars).

Run the dev server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000). Paste one of the seed codes to unlock the form.

## Environment variables

| Variable       | Where                       | Purpose                                                        |
| -------------- | --------------------------- | -------------------------------------------------------------- |
| `DATABASE_URL` | `.dev.vars` / Worker secret | Postgres connection string. SSL is auto-enabled for Neon/Supabase. |
| `DB_DRIVER`    | `wrangler.jsonc` vars       | Set to `neon` on Workers to use the HTTP driver.               |
| `ADMIN_TOKEN`  | `.dev.vars` / Worker secret | Token required to access `/admin` and `/api/admin/*`.          |
| `RESEND_API_KEY` | (optional) `.dev.vars` / Worker secret | Enables waitlist confirmation emails via [Resend](https://resend.com). Absent → email is skipped. |
| `RESEND_FROM`  | (optional) var              | Sender address, e.g. `Decant <noreply@decantrade.com>` (domain must be verified in Resend). |
| `SEED_COUNT`   | (optional, `db:init`)       | Number of seed codes to create. Default `12`.                  |
| `SEED_MAX_USES`| (optional, `db:init`)       | Uses per seed code. Default `100`.                             |

Secrets are **never** committed — `.dev.vars` and `.env*` are git-ignored. On Cloudflare,
provide them with `wrangler secret put DATABASE_URL` and `wrangler secret put ADMIN_TOKEN`.

## API

| Method | Route                 | Auth          | Description                                                    |
| ------ | --------------------- | ------------- | -------------------------------------------------------------- |
| `POST` | `/api/referral`       | rate-limited  | Validate a referral code → `{ valid, remaining }`.             |
| `POST` | `/api/waitlist`       | rate-limited  | Join via `wallet` (signed message) or `email`; mints 3 codes.  |
| `GET`  | `/api/stats`          | public        | `{ signups, wallets }` for public display.                     |
| `GET`  | `/api/admin/waitlist` | Bearer token  | Full signup list (requires `Authorization: Bearer <ADMIN_TOKEN>`). |

### Referral codes

Codes are 8 characters from the charset `0123456789ABCDEFGHJKMNPQRSTVWXYZ`
(digits + uppercase letters, excluding `I`, `L`, `O`, `U` to avoid ambiguity).

### Waitlist flow

1. Visitor enters a referral code → `/api/referral` validates it and the form unlocks.
2. They join with a Solana wallet (sign a message with the wallet's ed25519 key proving ownership — no gas, never moves funds) or an email.
3. On success they get a queue position and **3 new invite codes** to share.

## Deploy (Cloudflare Workers)

```bash
# Build the OpenNext bundle and preview it locally on workerd
pnpm cf:preview

# Set production secrets (once)
wrangler secret put DATABASE_URL
wrangler secret put ADMIN_TOKEN

# Build + deploy
pnpm cf:deploy
```

Custom domains (`decantrade.com`, `www.decantrade.com`) are configured in `wrangler.jsonc`
and must live in the same Cloudflare account as the Worker. Run the production `db:init`
against your Neon database before the first deploy.

## Scripts

| Script            | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `pnpm dev`        | Start the Next.js dev server.                        |
| `pnpm build`      | Production Next.js build.                            |
| `pnpm lint`       | Run ESLint.                                          |
| `pnpm db:init`    | Create tables and seed invite codes.                 |
| `pnpm cf:build`   | Build the Cloudflare/OpenNext bundle.                |
| `pnpm cf:preview` | Build and preview the Worker locally.                |
| `pnpm cf:deploy`  | Build and deploy to Cloudflare Workers.              |
| `pnpm cf:typegen` | Regenerate Cloudflare binding types.                 |

## On-chain program (Solana)

The perp engine is an **[Anchor](https://www.anchor-lang.com) program** deployed to **Solana devnet**.
It is **index-priced**: there is no vAMM or order book — PnL is computed directly from a Pyth
index price (`size × (exit − entry) / entry`), the protocol is the counterparty (the house),
and payouts are backed by each market's isolated insurance fund.

- **Instructions** — `initialize_market`, `deposit`, `open_position`, `close_position`,
  `liquidate`, `withdraw`, `push_price` (keeper index push), `add_insurance`.
- **Margin** — isolated, single-collateral (**USDC**, 6 decimals), one position per trader per market.
- **Guardrails (guarded launch)** — max leverage capped (20× MVP), per-wallet deposit caps and
  per-market open-interest caps, maintenance-margin liquidation.

Deployed addresses (devnet):

| Account | Address |
| --- | --- |
| Program | [`EAYBRfX1Q5ExvAVwGrM4k4eGnTPTvXhJnVFLaaTFsi5t`](https://explorer.solana.com/address/EAYBRfX1Q5ExvAVwGrM4k4eGnTPTvXhJnVFLaaTFsi5t?cluster=devnet) |
| SOL-PERP market #1 (PDA) | [`3qN4ppMd4tEjPfRhkE9ChivL3e5Em8mNsNGYNPY1aV5G`](https://explorer.solana.com/address/3qN4ppMd4tEjPfRhkE9ChivL3e5Em8mNsNGYNPY1aV5G?cluster=devnet) |
| Test USDC (devUSDC, 6 dec) | [`3HqzE8KthdmpwrGqVkqdgoNJEQuiECVLEFxsY1mkPkwA`](https://explorer.solana.com/address/3HqzE8KthdmpwrGqVkqdgoNJEQuiECVLEFxsY1mkPkwA?cluster=devnet) |

The web client wires to the program through [`lib/solana/`](lib/solana/) (IDL + PDAs) and the
Solana trade UI under [`components/trade/solana/`](components/trade/solana/) (Phantom/Solflare
via wallet-adapter). More detail is on [decantrade.com/docs](https://decantrade.com/docs).

## Keeper

An off-chain keeper keeps each market healthy: it pushes the latest **Pyth** index price on-chain
(`push_price`) every ~15 seconds and **liquidates** under-margined positions (`liquidate`), which
is permissionless. So marks track the real market and underwater positions get force-closed even
when nobody is trading.

## Legacy (Base)

The original Base EVM implementation is retained for reference and is **superseded by the Solana
program above**:

- [`contracts/`](contracts/) — Foundry/Solidity vAMM perp + permissionless `MarketFactory`,
  deployed to Base Sepolia (see [`contracts/deployments/base-sepolia.md`](contracts/deployments/base-sepolia.md)).
- [`keeper/`](keeper/) and [`keeper-worker/`](keeper-worker/) — the Base (viem) keeper + event indexer.

These are no longer the live system and are not deployed to Solana.

## Disclaimer

Decant is experimental software for trading derivatives. Perpetual futures use leverage and
are high-risk. Where any protocol functionality is available it runs on a test network using
tokens with no monetary value. Nothing in this repository or on the website is investment,
legal, or tax advice. See [Terms](https://decantrade.com/terms),
[Privacy](https://decantrade.com/privacy), and [Risk](https://decantrade.com/risk).
