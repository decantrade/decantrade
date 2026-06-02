import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Risk Disclaimer · Decant",
  description:
    "Important risks associated with perpetual futures and experimental DeFi software.",
};

export default function RiskPage() {
  return (
    <>
      <h1>Risk Disclaimer</h1>
      <p className="updated">Last updated: June 2026</p>

      <p>
        Decant is experimental software for trading derivatives. The following
        risks are not exhaustive. Read them carefully and do your own research
        before participating.
      </p>

      <h2>1. Pre-launch &amp; testnet</h2>
      <p>
        The product is in development. Where any protocol functionality is
        available, it runs on a <strong>test network</strong> using tokens that
        have <strong>no monetary value</strong>. Features, parameters, and
        availability may change or be removed at any time.
      </p>

      <h2>2. Perpetual futures are high-risk</h2>
      <p>
        Perpetual futures use <strong>leverage</strong>, which amplifies both
        gains and losses. You can lose your entire margin — and positions can be
        liquidated rapidly during volatility. Funding payments, slippage, and
        oracle movements can all work against you. Only ever risk what you can
        afford to lose.
      </p>

      <h2>3. Permissionless markets</h2>
      <p>
        Decant is designed so that anyone can create a market for any token.
        Markets are <strong>not vetted or endorsed</strong> by us. Tokens may be
        illiquid, manipulated, or worthless. The existence of a market implies
        nothing about its quality or safety.
      </p>

      <h2>4. Smart contract &amp; technology risk</h2>
      <p>
        Decentralized software can contain bugs, economic exploits, or
        vulnerabilities. Smart contracts may be unaudited or only partially
        audited. Network congestion, oracle failure, or front-running can cause
        loss. Transactions on a blockchain are generally irreversible.
      </p>

      <h2>5. Not financial advice</h2>
      <p>
        Nothing on this Service is investment, legal, accounting, or tax advice,
        and nothing is a recommendation to buy, sell, or hold any asset. You are
        solely responsible for your decisions.
      </p>

      <h2>6. Regulatory &amp; jurisdictional risk</h2>
      <p>
        Derivatives are regulated differently around the world and may be
        restricted or prohibited where you live. The Service may not be
        available to you, and it is your responsibility to ensure your use is
        lawful.
      </p>

      <h2>7. Questions</h2>
      <p>
        Reach us on X at{" "}
        <a href="https://x.com/decanttrade" target="_blank" rel="noreferrer">
          @decanttrade
        </a>
        .
      </p>
    </>
  );
}
