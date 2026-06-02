import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

interface SignupRow {
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

// Constant-time string comparison to avoid leaking the token via timing.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

function presentedToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (header && header.toLowerCase().startsWith("bearer ")) {
    return header.slice(7).trim();
  }
  const x = request.headers.get("x-admin-token");
  return x ? x.trim() : null;
}

function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s = String(value);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export async function GET(request: Request) {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected) {
    return NextResponse.json(
      { ok: false, reason: "admin_disabled" },
      { status: 500 },
    );
  }

  const token = presentedToken(request);
  if (!token || !safeEqual(token, expected)) {
    return NextResponse.json({ ok: false, reason: "unauthorized" }, { status: 401 });
  }

  let rows: SignupRow[];
  try {
    rows = (await sql`
      SELECT
        w.id,
        w.created_at,
        w.method,
        w.wallet_address,
        w.email,
        w.x_handle,
        w.referred_by,
        COALESCE(c.minted, 0)::int AS codes_minted,
        COALESCE(c.uses, 0)::int   AS codes_uses
      FROM decant_waitlist w
      LEFT JOIN (
        SELECT owner_id, count(*)::int AS minted, COALESCE(sum(uses), 0)::int AS uses
        FROM decant_referral_codes
        WHERE owner_id IS NOT NULL
        GROUP BY owner_id
      ) c ON c.owner_id = w.id
      ORDER BY w.id ASC
    `) as SignupRow[];
  } catch {
    return NextResponse.json(
      { ok: false, reason: "db_error" },
      { status: 500 },
    );
  }

  const url = new URL(request.url);
  if (url.searchParams.get("format") === "csv") {
    const headers = [
      "position",
      "created_at",
      "method",
      "email",
      "wallet_address",
      "x_handle",
      "referred_by",
      "codes_minted",
      "codes_uses",
    ];
    const lines = [headers.join(",")];
    rows.forEach((r, i) => {
      lines.push(
        [
          i + 1,
          r.created_at,
          r.method,
          r.email,
          r.wallet_address,
          r.x_handle,
          r.referred_by,
          r.codes_minted,
          r.codes_uses,
        ]
          .map(csvCell)
          .join(","),
      );
    });
    const csv = lines.join("\n");
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="decant-waitlist-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  }

  const signups = rows.map((r, i) => ({ position: i + 1, ...r }));
  const wallets = rows.filter((r) => r.method === "wallet").length;
  return NextResponse.json(
    {
      ok: true,
      total: rows.length,
      wallets,
      emails: rows.length - wallets,
      signups,
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
