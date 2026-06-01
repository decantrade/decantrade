"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAccount, useConnect, useDisconnect, useSignMessage } from "wagmi";
import { Reveal } from "./Reveal";
import {
  CODE_LENGTH,
  buildWaitlistMessage,
  isValidCodeFormat,
  isValidEmail,
  normalizeCode,
} from "@/lib/referral";

type Method = "wallet" | "email";
type CodeStatus = "idle" | "checking" | "valid" | "invalid";

interface JoinResult {
  position: number;
  total: number;
  codes: string[];
  already: boolean;
}

const REASONS: Record<string, string> = {
  invalid_format: "Code must be 8 characters (0–9, A–Z without I/L/O/U).",
  not_found: "That code doesn't exist.",
  inactive: "That code has been deactivated.",
  exhausted: "That code has no invites left.",
  code_not_found: "That code doesn't exist.",
  code_inactive: "That code has been deactivated.",
  code_exhausted: "That code has no invites left.",
  invalid_email: "Enter a valid email address.",
  invalid_address: "Connect a valid wallet first.",
  invalid_handle: "That X handle looks off.",
  bad_signature: "Signature could not be verified.",
  already_joined: "You're already on the list.",
};

function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function Waitlist() {
  const [code, setCode] = useState(() => {
    if (typeof window === "undefined") return "";
    const params = new URLSearchParams(window.location.search);
    const ref = params.get("ref") ?? params.get("code");
    return ref ? normalizeCode(ref).slice(0, CODE_LENGTH) : "";
  });
  const [serverResult, setServerResult] = useState<{
    code: string;
    valid: boolean;
    reason?: string;
    remaining?: number;
  } | null>(null);
  const [unlocked, setUnlocked] = useState(false);

  const [method, setMethod] = useState<Method>("wallet");
  const [email, setEmail] = useState("");
  const [xHandle, setXHandle] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<JoinResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending: connecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { signMessageAsync } = useSignMessage();

  const formatValid = isValidCodeFormat(code);

  // Validate against the server (debounced). Only the async result is written
  // to state, so there is no synchronous setState in the effect body.
  useEffect(() => {
    if (!formatValid) return;
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        const res = await fetch("/api/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        setServerResult({
          code,
          valid: !!data.valid,
          reason: data.reason,
          remaining: data.remaining,
        });
      } catch (e) {
        if ((e as Error).name !== "AbortError") {
          setServerResult({ code, valid: false, reason: "network" });
        }
      }
    }, 350);
    return () => {
      ctrl.abort();
      clearTimeout(t);
    };
  }, [code, formatValid]);

  // Derive the code's UI status from inputs + the latest server result.
  let codeStatus: CodeStatus;
  let codeMsg: string | null = null;
  if (code.length === 0) {
    codeStatus = "idle";
  } else if (!formatValid) {
    codeStatus = "invalid";
    codeMsg = code.length === CODE_LENGTH ? REASONS.invalid_format : null;
  } else if (serverResult && serverResult.code === code) {
    if (serverResult.valid) {
      codeStatus = "valid";
      codeMsg =
        typeof serverResult.remaining === "number"
          ? `Valid · ${serverResult.remaining} invite${serverResult.remaining === 1 ? "" : "s"} left`
          : "Valid code";
    } else {
      codeStatus = "invalid";
      codeMsg =
        serverResult.reason === "network"
          ? "Could not check code. Try again."
          : (REASONS[serverResult.reason ?? ""] ?? "Invalid code.");
    }
  } else {
    codeStatus = "checking";
  }

  const canSubmit = useMemo(() => {
    if (!unlocked || submitting) return false;
    if (method === "email") return isValidEmail(email);
    return isConnected && !!address;
  }, [unlocked, submitting, method, email, isConnected, address]);

  const submit = useCallback(async () => {
    setError(null);
    setSubmitting(true);
    try {
      const handle = xHandle.trim() || undefined;
      let payload: Record<string, unknown>;

      if (method === "wallet") {
        if (!address) throw new Error("no_wallet");
        const issuedAt = new Date().toISOString();
        const message = buildWaitlistMessage(address, code, issuedAt);
        const signature = await signMessageAsync({ message });
        payload = {
          method: "wallet",
          code,
          walletAddress: address,
          signature,
          message,
          xHandle: handle,
        };
      } else {
        payload = { method: "email", code, email: email.trim(), xHandle: handle };
      }

      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) {
        setError(REASONS[data.reason] ?? "Something went wrong. Try again.");
        return;
      }
      setResult({
        position: data.position,
        total: data.total,
        codes: data.codes ?? [],
        already: !!data.already,
      });
    } catch (e) {
      const msg = (e as Error).message;
      setError(
        msg?.includes("User rejected") || msg?.includes("denied")
          ? "Signature request was rejected."
          : "Something went wrong. Try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }, [method, address, code, email, xHandle, signMessageAsync]);

  const copy = useCallback((text: string) => {
    navigator.clipboard?.writeText(text).then(() => {
      setCopied(text);
      setTimeout(() => setCopied(null), 1500);
    });
  }, []);

  return (
    <section id="waitlist" className="border-b border-line">
      <div className="mx-auto grid max-w-6xl gap-12 px-5 py-20 lg:grid-cols-2">
        <Reveal>
          <div>
            <p className="mb-3 text-[11px] uppercase tracking-[0.22em] text-amber">
              ── Reserve your spot
            </p>
            <h2 className="text-3xl font-semibold leading-tight tracking-tight sm:text-4xl">
              Invite-only. <br className="hidden sm:block" />
              Code required.
            </h2>
            <p className="mt-6 max-w-md text-sm leading-7 text-ink-soft">
              The waitlist is gated. Paste a referral code from an existing
              member and the form unlocks — finish in under a minute with a Base
              wallet or an email.
            </p>
            <ul className="mt-8 space-y-3 text-[13px] text-ink-soft">
              <li className="flex gap-3">
                <span className="text-amber">→</span> Got a code? Paste it. The
                form unlocks.
              </li>
              <li className="flex gap-3">
                <span className="text-amber">→</span> Came from a share link?
                Your code is pre-filled.
              </li>
              <li className="flex gap-3">
                <span className="text-amber">→</span> No code yet? Follow{" "}
                <a
                  href="https://x.com/decanttrade"
                  target="_blank"
                  rel="noreferrer"
                  className="text-amber underline-offset-4 hover:underline"
                >
                  @decanttrade
                </a>
                — we drop them on tweets.
              </li>
            </ul>
          </div>
        </Reveal>

        <Reveal delay={0.1}>
          <div className="rounded-sm border border-line bg-panel">
            <div className="flex items-center justify-between border-b border-line px-5 py-3">
              <span className="text-[11px] uppercase tracking-[0.18em] text-ink-dim">
                waitlist · v1
              </span>
              <span className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] text-amber">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-amber" />
                invite only
              </span>
            </div>

            {result ? (
              <SuccessPanel result={result} copy={copy} copied={copied} />
            ) : (
              <div className="p-5">
                {/* Referral code */}
                <label className="mb-1 block text-[10px] uppercase tracking-[0.18em] text-ink-dim">
                  referral code · required
                </label>
                <input
                  value={code}
                  onChange={(e) =>
                    setCode(
                      normalizeCode(e.target.value).slice(0, CODE_LENGTH),
                    )
                  }
                  placeholder="AB23XYZ9"
                  spellCheck={false}
                  autoComplete="off"
                  className={`w-full rounded-sm border bg-bg px-3 py-2.5 font-mono text-sm tracking-[0.3em] text-ink placeholder:text-ink-dim/60 ${
                    codeStatus === "valid"
                      ? "border-green/60"
                      : codeStatus === "invalid"
                        ? "border-wine/60"
                        : "border-line focus:border-amber/60"
                  }`}
                />
                <div className="mt-1.5 flex min-h-4 items-center justify-between text-[11px]">
                  <span
                    className={
                      codeStatus === "valid"
                        ? "text-green"
                        : codeStatus === "invalid"
                          ? "text-wine"
                          : "text-ink-dim"
                    }
                  >
                    {codeStatus === "checking"
                      ? "Checking…"
                      : (codeMsg ?? "8 characters · 0–9 and A–Z (no I/L/O/U)")}
                  </span>
                </div>

                {!unlocked ? (
                  <button
                    type="button"
                    disabled={codeStatus !== "valid"}
                    onClick={() => setUnlocked(true)}
                    className="mt-4 w-full rounded-sm bg-amber px-4 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-black transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-dim"
                  >
                    {codeStatus === "valid"
                      ? "Continue"
                      : "Enter referral code to continue"}
                  </button>
                ) : (
                  <div className="mt-5">
                    {/* Method tabs */}
                    <div className="grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line">
                      {(["wallet", "email"] as Method[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => {
                            setMethod(m);
                            setError(null);
                          }}
                          className={`px-4 py-2.5 text-xs font-semibold uppercase tracking-[0.12em] transition-colors ${
                            method === m
                              ? "bg-bg text-amber"
                              : "bg-panel text-ink-dim hover:text-ink-soft"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>

                    <div className="mt-4 space-y-3">
                      {method === "wallet" ? (
                        <div>
                          {isConnected && address ? (
                            <div className="flex items-center justify-between rounded-sm border border-line bg-bg px-3 py-2.5">
                              <span className="font-mono text-sm text-ink">
                                {shorten(address)}
                              </span>
                              <button
                                type="button"
                                onClick={() => disconnect()}
                                className="text-[11px] uppercase tracking-[0.12em] text-ink-dim hover:text-wine"
                              >
                                disconnect
                              </button>
                            </div>
                          ) : (
                            <div className="space-y-2">
                              {connectors.map((c) => (
                                <button
                                  key={c.uid}
                                  type="button"
                                  disabled={connecting}
                                  onClick={() => connect({ connector: c })}
                                  className="flex w-full items-center justify-between rounded-sm border border-line bg-bg px-3 py-2.5 text-sm text-ink transition-colors hover:border-amber/50 disabled:opacity-60"
                                >
                                  <span>{c.name}</span>
                                  <span className="text-[11px] text-ink-dim">
                                    connect →
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      ) : (
                        <input
                          type="email"
                          value={email}
                          onChange={(e) => setEmail(e.target.value)}
                          placeholder="you@email.com"
                          autoComplete="email"
                          className="w-full rounded-sm border border-line bg-bg px-3 py-2.5 text-sm text-ink placeholder:text-ink-dim/60 focus:border-amber/60"
                        />
                      )}

                      <input
                        value={xHandle}
                        onChange={(e) => setXHandle(e.target.value)}
                        placeholder="@yourhandle (optional)"
                        autoComplete="off"
                        spellCheck={false}
                        className="w-full rounded-sm border border-line bg-bg px-3 py-2.5 text-sm text-ink placeholder:text-ink-dim/60 focus:border-amber/60"
                      />
                    </div>

                    {error && (
                      <p className="mt-3 text-[12px] text-wine">{error}</p>
                    )}

                    <button
                      type="button"
                      disabled={!canSubmit}
                      onClick={submit}
                      className="mt-4 w-full rounded-sm bg-amber px-4 py-3 text-sm font-semibold uppercase tracking-[0.1em] text-black transition-opacity enabled:hover:opacity-90 disabled:cursor-not-allowed disabled:bg-line disabled:text-ink-dim"
                    >
                      {submitting
                        ? method === "wallet"
                          ? "Sign in your wallet…"
                          : "Joining…"
                        : "Join the waitlist"}
                    </button>

                    <p className="mt-3 text-[11px] leading-5 text-ink-dim">
                      {method === "wallet"
                        ? "Coinbase Wallet · MetaMask — sign-only, no gas, never moves funds."
                        : "One confirmation email. No spam, no drips."}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </Reveal>
      </div>
    </section>
  );
}

function SuccessPanel({
  result,
  copy,
  copied,
}: {
  result: JoinResult;
  copy: (t: string) => void;
  copied: string | null;
}) {
  return (
    <div className="p-5">
      <div className="flex items-center gap-2 text-green">
        <span className="inline-block h-2 w-2 rounded-full bg-green" />
        <span className="text-sm font-semibold uppercase tracking-[0.14em]">
          {result.already ? "Already on the list" : "You're on the list"}
        </span>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-px overflow-hidden rounded-sm border border-line bg-line">
        <div className="bg-bg p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            your position
          </div>
          <div className="mt-1 text-2xl font-semibold text-amber">
            #{result.position}
          </div>
        </div>
        <div className="bg-bg p-4">
          <div className="text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            total on list
          </div>
          <div className="mt-1 text-2xl font-semibold text-ink">
            {result.total.toLocaleString()}
          </div>
        </div>
      </div>

      {result.codes.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 text-[10px] uppercase tracking-[0.18em] text-ink-dim">
            your invite codes — share to move up
          </div>
          <div className="space-y-2">
            {result.codes.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => copy(c)}
                className="flex w-full items-center justify-between rounded-sm border border-line bg-bg px-3 py-2.5 font-mono text-sm tracking-[0.2em] text-ink transition-colors hover:border-amber/50"
              >
                <span>{c}</span>
                <span className="text-[11px] uppercase tracking-[0.12em] text-ink-dim">
                  {copied === c ? "copied ✓" : "copy"}
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
