"use client";

import { useCallback, useEffect, useState } from "react";

interface Signup {
  position: number;
  id: number;
  created_at: string;
  method: "wallet" | "email";
  wallet_address: string | null;
  email: string | null;
  x_handle: string | null;
  referred_by: string;
  codes_minted: number;
  codes_uses: number;
}

interface AdminData {
  ok: true;
  total: number;
  wallets: number;
  emails: number;
  signups: Signup[];
}

const STORAGE_KEY = "decant_admin_token";

function shorten(addr: string) {
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function fmtDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toISOString().replace("T", " ").slice(0, 16) + "Z";
}

export default function AdminPage() {
  const [token, setToken] = useState(() => {
    if (typeof window === "undefined") return "";
    return sessionStorage.getItem(STORAGE_KEY) ?? "";
  });
  const [authed, setAuthed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<AdminData | null>(null);
  const [downloading, setDownloading] = useState(false);

  const load = useCallback(async (tok: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/waitlist", {
        headers: { Authorization: `Bearer ${tok}` },
        cache: "no-store",
      });
      if (res.status === 401) {
        setError("Wrong password.");
        setAuthed(false);
        sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as
          | { reason?: string }
          | null;
        setError(
          body?.reason === "admin_disabled"
            ? "ADMIN_TOKEN is not set on the server."
            : "Failed to load waitlist.",
        );
        return;
      }
      const json = (await res.json()) as AdminData;
      setData(json);
      setAuthed(true);
      sessionStorage.setItem(STORAGE_KEY, tok);
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }, []);

  // Restore a previously entered token for this tab (token itself is seeded
  // lazily from sessionStorage in useState above).
  useEffect(() => {
    const saved = sessionStorage.getItem(STORAGE_KEY);
    if (!saved) return;
    const t = setTimeout(() => void load(saved), 0);
    return () => clearTimeout(t);
  }, [load]);

  const downloadCsv = useCallback(async () => {
    setDownloading(true);
    try {
      const res = await fetch("/api/admin/waitlist?format=csv", {
        headers: { Authorization: `Bearer ${token}` },
        cache: "no-store",
      });
      if (!res.ok) {
        setError("CSV export failed.");
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `decant-waitlist-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      setError("CSV export failed.");
    } finally {
      setDownloading(false);
    }
  }, [token]);

  const lock = useCallback(() => {
    sessionStorage.removeItem(STORAGE_KEY);
    setAuthed(false);
    setData(null);
    setToken("");
  }, []);

  if (!authed) {
    return (
      <main className="min-h-screen bg-bg text-ink font-mono flex items-center justify-center px-5">
        <div className="w-full max-w-sm border border-line bg-panel p-6">
          <p className="text-amber text-xs tracking-[0.2em] uppercase mb-1">
            Decant
          </p>
          <h1 className="text-lg text-ink mb-4">Waitlist admin</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (token) void load(token);
            }}
          >
            <label className="block text-xs text-ink-dim mb-2">Password</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoFocus
              className="w-full bg-bg border border-line px-3 py-2 text-sm text-ink focus:border-amber"
              placeholder="••••••••"
            />
            {error && <p className="text-wine text-xs mt-3">{error}</p>}
            <button
              type="submit"
              disabled={!token || loading}
              className="mt-4 w-full bg-amber text-black text-sm py-2 disabled:opacity-40"
            >
              {loading ? "Checking…" : "Unlock"}
            </button>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-bg text-ink font-mono px-4 py-6 md:px-8">
      <div className="mx-auto max-w-6xl">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
          <div>
            <p className="text-amber text-xs tracking-[0.2em] uppercase">Decant</p>
            <h1 className="text-lg text-ink">Waitlist admin</h1>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => void load(token)}
              disabled={loading}
              className="border border-line px-3 py-1.5 text-xs text-ink-soft hover:border-amber disabled:opacity-40"
            >
              {loading ? "…" : "Refresh"}
            </button>
            <button
              onClick={() => void downloadCsv()}
              disabled={downloading || !data?.total}
              className="bg-amber text-black px-3 py-1.5 text-xs disabled:opacity-40"
            >
              {downloading ? "Exporting…" : "Export CSV"}
            </button>
            <button
              onClick={lock}
              className="border border-line px-3 py-1.5 text-xs text-ink-dim hover:border-wine hover:text-wine"
            >
              Lock
            </button>
          </div>
        </div>

        {error && <p className="text-wine text-xs mb-4">{error}</p>}

        <div className="grid grid-cols-3 gap-3 mb-6">
          {[
            { label: "Total signups", value: data?.total ?? 0 },
            { label: "Wallet", value: data?.wallets ?? 0 },
            { label: "Email", value: data?.emails ?? 0 },
          ].map((s) => (
            <div key={s.label} className="border border-line bg-panel p-4">
              <p className="text-2xl text-amber">{s.value}</p>
              <p className="text-xs text-ink-dim mt-1">{s.label}</p>
            </div>
          ))}
        </div>

        <div className="border border-line overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-bg-soft text-ink-dim text-left">
                <th className="px-3 py-2 font-normal">#</th>
                <th className="px-3 py-2 font-normal">Joined (UTC)</th>
                <th className="px-3 py-2 font-normal">Via</th>
                <th className="px-3 py-2 font-normal">Email / Wallet</th>
                <th className="px-3 py-2 font-normal">X</th>
                <th className="px-3 py-2 font-normal">Ref by</th>
                <th className="px-3 py-2 font-normal text-right">Minted</th>
                <th className="px-3 py-2 font-normal text-right">Uses</th>
              </tr>
            </thead>
            <tbody>
              {data && data.signups.length > 0 ? (
                data.signups.map((s) => (
                  <tr key={s.id} className="border-t border-line-soft">
                    <td className="px-3 py-2 text-ink-dim">{s.position}</td>
                    <td className="px-3 py-2 text-ink-soft whitespace-nowrap">
                      {fmtDate(s.created_at)}
                    </td>
                    <td className="px-3 py-2">
                      <span
                        className={
                          s.method === "wallet" ? "text-green" : "text-amber-soft"
                        }
                      >
                        {s.method}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-ink break-all">
                      {s.method === "wallet"
                        ? s.wallet_address
                          ? shorten(s.wallet_address)
                          : "—"
                        : (s.email ?? "—")}
                    </td>
                    <td className="px-3 py-2 text-ink-soft">
                      {s.x_handle ? `@${s.x_handle}` : "—"}
                    </td>
                    <td className="px-3 py-2 text-ink-dim">{s.referred_by}</td>
                    <td className="px-3 py-2 text-right text-ink-soft">
                      {s.codes_minted}
                    </td>
                    <td className="px-3 py-2 text-right text-ink-soft">
                      {s.codes_uses}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td
                    colSpan={8}
                    className="px-3 py-10 text-center text-ink-dim"
                  >
                    {loading ? "Loading…" : "No signups yet."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </main>
  );
}
