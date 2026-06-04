import { NextResponse } from "next/server";
import { sql } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const rows = await sql`
      SELECT
        (SELECT count(*)::int FROM decant_waitlist) AS signups,
        (SELECT count(*)::int FROM decant_waitlist WHERE method = 'wallet') AS wallets
    `;
    const r = rows[0] as { signups: number; wallets: number };
    return NextResponse.json({ signups: r.signups, wallets: r.wallets });
  } catch {
    return NextResponse.json({ signups: 0, wallets: 0 });
  }
}
