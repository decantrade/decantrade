import { NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { isValidCodeFormat, normalizeCode } from "@/lib/referral";
import { clientIp, rateLimit } from "@/lib/ratelimit";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!(await rateLimit(`ref:${clientIp(request)}`, 60, 60_000))) {
    return NextResponse.json(
      { valid: false, reason: "rate_limited" },
      { status: 429 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ valid: false, reason: "bad_request" }, { status: 400 });
  }

  const raw = (body as { code?: unknown })?.code;
  if (typeof raw !== "string") {
    return NextResponse.json({ valid: false, reason: "missing_code" }, { status: 400 });
  }

  const code = normalizeCode(raw);
  if (!isValidCodeFormat(code)) {
    return NextResponse.json({ valid: false, reason: "invalid_format" });
  }

  const rows = await sql`
    SELECT code, max_uses, uses, active
    FROM decant_referral_codes
    WHERE code = ${code}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return NextResponse.json({ valid: false, reason: "not_found" });
  }

  const row = rows[0] as { max_uses: number; uses: number; active: boolean };
  if (!row.active) {
    return NextResponse.json({ valid: false, reason: "inactive" });
  }
  if (row.uses >= row.max_uses) {
    return NextResponse.json({ valid: false, reason: "exhausted" });
  }

  return NextResponse.json({
    valid: true,
    remaining: row.max_uses - row.uses,
  });
}
