"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { AnchorProvider, BN } from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import {
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddress,
  getAccount,
} from "@solana/spl-token";
import {
  getProgram,
  getReadonlyProvider,
  marketPda,
  vaultPda,
  userBalancePda,
  positionPda,
  fmtUsd,
  sendTx,
  USDC,
  MARKET_ID,
  NETWORK,
  IS_MAINNET,
} from "@/lib/solana/program";
import PriceChart from "./PriceChart";
import "./solana-trade.css";

type MarketState = {
  indexPrice: BN;
  insuranceFund: BN;
  totalOpenInterest: BN;
  maxLeverage: BN;
  maintenanceMarginBps: number;
  tradingFeeBps: number;
  paused: boolean;
  collateralMint: PublicKey;
};
type PositionState = { sizeUsd: BN; entryPrice: BN; margin: BN };

export default function SolanaTrade() {
  const { connection } = useConnection();
  const wallet = useWallet();

  const market = useMemo(() => marketPda(), []);
  const [m, setM] = useState<MarketState | null>(null);
  const [free, setFree] = useState<number>(0);
  const [pos, setPos] = useState<PositionState | null>(null);
  const [walletUsdc, setWalletUsdc] = useState<number | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [side, setSide] = useState<"long" | "short">("long");
  const [margin, setMargin] = useState("100");
  const [lev, setLev] = useState(5);
  const [depAmt, setDepAmt] = useState("100");
  const [wdAmt, setWdAmt] = useState("");

  const flash = (s: string) => {
    setToast(s);
    setTimeout(() => setToast(null), 6000);
  };

  const refresh = useCallback(async () => {
    try {
      const program = getProgram(getReadonlyProvider());
      const mkt: any = await program.account.market.fetch(market).catch(() => null);
      if (!mkt) {
        setNotFound(true);
        setM(null);
        return;
      }
      setNotFound(false);
      setM({
        indexPrice: mkt.indexPrice,
        insuranceFund: mkt.insuranceFund,
        totalOpenInterest: mkt.totalOpenInterest,
        maxLeverage: mkt.maxLeverage,
        maintenanceMarginBps: mkt.maintenanceMarginBps,
        tradingFeeBps: mkt.tradingFeeBps,
        paused: mkt.paused,
        collateralMint: mkt.collateralMint,
      });
      if (wallet.publicKey) {
        const bal: any = await program.account.userBalance
          .fetch(userBalancePda(market, wallet.publicKey))
          .catch(() => null);
        setFree(bal ? bal.freeCollateral.toNumber() : 0);
        const p: any = await program.account.position
          .fetch(positionPda(market, wallet.publicKey))
          .catch(() => null);
        setPos(p && p.sizeUsd.toNumber() !== 0 ? p : null);
        try {
          const ata = await getAssociatedTokenAddress(mkt.collateralMint, wallet.publicKey);
          const acc = await getAccount(connection, ata);
          setWalletUsdc(Number(acc.amount));
        } catch {
          setWalletUsdc(0);
        }
      }
    } catch (e) {
      console.error(e);
    }
  }, [market, wallet.publicKey, connection]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [refresh]);

  const provider = useMemo(() => {
    if (!wallet.publicKey || !wallet.signTransaction) return null;
    return new AnchorProvider(connection, wallet as any, { commitment: "confirmed" });
  }, [connection, wallet]);

  const run = async (label: string, fn: () => Promise<string>) => {
    if (!provider) return;
    setBusy(true);
    try {
      const sig = await fn();
      flash(`${label} ✓  ${sig.slice(0, 8)}…`);
      await refresh();
    } catch (e: any) {
      flash(`${label} failed: ${e.message ?? e}`);
    } finally {
      setBusy(false);
    }
  };

  const doDeposit = () =>
    run("Deposit", async () => {
      const program = getProgram(provider!);
      const amt = new BN(Math.round(parseFloat(depAmt) * USDC));
      const userToken = await getAssociatedTokenAddress(m!.collateralMint, wallet.publicKey!);
      const builder = program.methods
        .deposit(amt)
        .accountsPartial({
          owner: wallet.publicKey!,
          market,
          userBalance: userBalancePda(market, wallet.publicKey!),
          userToken,
          vault: vaultPda(market),
          tokenProgram: TOKEN_PROGRAM_ID,
          systemProgram: SystemProgram.programId,
        });
      return sendTx(provider!, builder);
    });

  const doWithdraw = () =>
    run("Withdraw", async () => {
      const program = getProgram(provider!);
      const amt = new BN(Math.round(parseFloat(wdAmt || "0") * USDC));
      const userToken = await getAssociatedTokenAddress(m!.collateralMint, wallet.publicKey!);
      const builder = program.methods
        .withdraw(amt)
        .accountsPartial({
          owner: wallet.publicKey!,
          market,
          userBalance: userBalancePda(market, wallet.publicKey!),
          userToken,
          vault: vaultPda(market),
          tokenProgram: TOKEN_PROGRAM_ID,
        });
      return sendTx(provider!, builder);
    });

  const doOpen = () =>
    run("Open " + side, async () => {
      const program = getProgram(provider!);
      const mg = new BN(Math.round(parseFloat(margin) * USDC));
      const builder = program.methods
        .openPosition(side === "long", mg, new BN(lev))
        .accountsPartial({
          owner: wallet.publicKey!,
          market,
          userBalance: userBalancePda(market, wallet.publicKey!),
          position: positionPda(market, wallet.publicKey!),
          systemProgram: SystemProgram.programId,
        });
      return sendTx(provider!, builder);
    });

  const doClose = () =>
    run("Close", async () => {
      const program = getProgram(provider!);
      const builder = program.methods
        .closePosition()
        .accountsPartial({
          owner: wallet.publicKey!,
          market,
          userBalance: userBalancePda(market, wallet.publicKey!),
          position: positionPda(market, wallet.publicKey!),
          systemProgram: SystemProgram.programId,
        });
      return sendTx(provider!, builder);
    });

  const notional = (parseFloat(margin) || 0) * lev;
  const fee = m ? (notional * m.tradingFeeBps) / 10000 : 0;

  const pnl =
    pos && m
      ? (pos.sizeUsd.toNumber() *
          (m.indexPrice.toNumber() - pos.entryPrice.toNumber())) /
        pos.entryPrice.toNumber()
      : 0;

  const posLeverage =
    pos && pos.margin.toNumber() > 0
      ? Math.abs(pos.sizeUsd.toNumber()) / pos.margin.toNumber()
      : 0;

  // Index-priced liquidation: equity (margin + PnL) hits the maintenance
  // requirement (mm × current notional). Solved for the index price.
  const liqPrice = (() => {
    if (!pos || !m) return null;
    const entry = pos.entryPrice.toNumber();
    const size = pos.sizeUsd.toNumber();
    const marginV = pos.margin.toNumber();
    const s = Math.abs(size);
    if (s === 0 || entry === 0) return null;
    const mm = m.maintenanceMarginBps / 10000;
    const p =
      size > 0
        ? (entry * (s - marginV)) / (s * (1 - mm))
        : (entry * (s + marginV)) / (s * (1 + mm));
    return p > 0 ? p : 0;
  })();

  const netLabel = IS_MAINNET ? "Solana · mainnet" : "Solana · devnet";

  return (
    <div className="solana-trade">
      <div className="top">
        <div className="brand">
          SOL-PERP <span className="badge">{netLabel}</span>
        </div>
        <WalletMultiButton />
      </div>

      {notFound && (
        <div className="banner warn">
          Market #{MARKET_ID.toString()} isn’t initialized on {NETWORK} yet (the program is
          deployed; the market is not). This panel goes live as soon as it’s initialized.
        </div>
      )}
      {m?.paused && (
        <div className="banner">Market paused — new deposits and positions are disabled.</div>
      )}

      <div className="grid">
        <div style={{ display: "grid", gap: 16 }}>
          <div className="card">
            <h2>SOL-PERP · Index</h2>
            <div className="big">{m ? fmtUsd(m.indexPrice) : "—"}</div>
            <PriceChart />
            <div style={{ marginTop: 14 }}>
              <div className="statrow"><span className="k">Insurance (house)</span><span className="v">{m ? fmtUsd(m.insuranceFund) : "—"}</span></div>
              <div className="statrow"><span className="k">Open interest</span><span className="v">{m ? fmtUsd(m.totalOpenInterest) : "—"}</span></div>
              <div className="statrow"><span className="k">Max leverage</span><span className="v">{m ? `${m.maxLeverage.toString()}×` : "—"}</span></div>
              <div className="statrow"><span className="k">Trading fee</span><span className="v">{m ? `${(m.tradingFeeBps / 100).toFixed(2)}%` : "—"}</span></div>
            </div>
          </div>

          <div className="card">
            <h2>Collateral</h2>
            <div className="statrow"><span className="k">Free collateral</span><span className="v">{fmtUsd(free)}</span></div>
            <div className="statrow"><span className="k">Wallet USDC</span><span className="v">{walletUsdc === null ? "—" : fmtUsd(walletUsdc)}</span></div>
            <label>
              Deposit (USDC)
              {walletUsdc !== null && walletUsdc > 0 && (
                <button type="button" className="maxbtn" onClick={() => setDepAmt((walletUsdc / USDC).toString())}>Max</button>
              )}
            </label>
            <div className="row">
              <input value={depAmt} onChange={(e) => setDepAmt(e.target.value)} inputMode="decimal" />
              <button className="act neutral" style={{ marginTop: 0, flex: "0 0 110px" }} disabled={!provider || busy || m?.paused} onClick={doDeposit}>Deposit</button>
            </div>
            <label>
              Withdraw (USDC)
              {free > 0 && (
                <button type="button" className="maxbtn" onClick={() => setWdAmt((free / USDC).toString())}>Max</button>
              )}
            </label>
            <div className="row">
              <input value={wdAmt} onChange={(e) => setWdAmt(e.target.value)} placeholder={(free / USDC).toString()} inputMode="decimal" />
              <button className="act ghost" style={{ marginTop: 0, flex: "0 0 110px" }} disabled={!provider || busy} onClick={doWithdraw}>Withdraw</button>
            </div>
          </div>
        </div>

        <div style={{ display: "grid", gap: 16 }}>
          {pos ? (
            <div className="card">
              <h2>Your position</h2>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span className={`pill ${pos.sizeUsd.toNumber() > 0 ? "l" : "s"}`}>{pos.sizeUsd.toNumber() > 0 ? "LONG" : "SHORT"}</span>
                <span className="big" style={{ fontSize: 24 }} >
                  <span className={pnl >= 0 ? "pos" : "neg"}>{pnl >= 0 ? "+" : ""}{fmtUsd(pnl)}</span>
                </span>
              </div>
              <div className="statrow"><span className="k">Size (notional)</span><span className="v">{fmtUsd(Math.abs(pos.sizeUsd.toNumber()))}</span></div>
              <div className="statrow"><span className="k">Leverage</span><span className="v">{posLeverage.toFixed(1)}×</span></div>
              <div className="statrow"><span className="k">Entry price</span><span className="v">{fmtUsd(pos.entryPrice)}</span></div>
              <div className="statrow"><span className="k">Margin</span><span className="v">{fmtUsd(pos.margin)}</span></div>
              <div className="statrow"><span className="k">Est. liquidation</span><span className="v">{liqPrice ? fmtUsd(liqPrice) : "—"}</span></div>
              <button className="act ghost" disabled={!provider || busy} onClick={doClose}>Close position &amp; settle PnL</button>
            </div>
          ) : (
            <div className="card">
              <h2>Open position</h2>
              <div className="seg">
                <button className={side === "long" ? "on l" : ""} onClick={() => setSide("long")}>Long</button>
                <button className={side === "short" ? "on s" : ""} onClick={() => setSide("short")}>Short</button>
              </div>
              <label>Margin (USDC)</label>
              <input value={margin} onChange={(e) => setMargin(e.target.value)} inputMode="decimal" />
              <label>Leverage</label>
              <div className="lev">
                {[2, 5, 10, 20].filter((x) => !m || x <= m.maxLeverage.toNumber()).map((x) => (
                  <button key={x} className={lev === x ? "on" : ""} onClick={() => setLev(x)}>{x}×</button>
                ))}
              </div>
              <div className="statrow" style={{ marginTop: 14 }}><span className="k">Notional</span><span className="v">{fmtUsd(notional * USDC)}</span></div>
              <div className="statrow"><span className="k">Open fee</span><span className="v">{fmtUsd(fee * USDC)}</span></div>
              <button className={`act ${side}`} disabled={!provider || busy || m?.paused} onClick={doOpen}>
                {provider ? `Open ${side} ${lev}×` : "Connect wallet"}
              </button>
            </div>
          )}

          <div className="card">
            <h2>About</h2>
            <div className="note">
              Index-priced perp — the protocol is the counterparty (the house). PnL = size ×
              (index − entry) / entry, paid from the insurance fund. {IS_MAINNET
                ? "Guarded mainnet — real funds, small caps, low leverage."
                : "Devnet only — test funds, no real money."}{" "}
              The index price is pushed on-chain by a keeper from Pyth.
            </div>
          </div>
        </div>
      </div>

      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}
