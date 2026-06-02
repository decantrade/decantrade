import { NextResponse } from "next/server";
import { verifyMessage } from "viem";
import { sql } from "@/lib/db";
import {
  generateCode,
  isValidCodeFormat,
  isValidEmail,
  isValidEvmAddress,
  normalizeCode,
  normalizeHandle,
} from "@/lib/referral";
import { clientIp, rateLimit } from "@/lib/ratelimit";
import { sendWaitlistConfirmation } from "@/lib/email";

export const dynamic = "force-dynamic";

const CODES_PER_SIGNUP = 3;
const NEW_CODE_MAX_USES = 3;

interface JoinBody {
  method?: "wallet" | "email";
  code?: string;
  walletAddress?: string;
  email?: string;
  xHandle?: string;
  signature?: string;
  message?: string;
  // Honeypot: must stay empty. Bots that fill every field trip this.
  company?: string;
}

function bad(reason: string, status = 400) {
  return NextResponse.json({ ok: false, reason }, { status });
}

async function ownedCodes(ownerId: number): Promise<string[]> {
  const rows = await sql`
    SELECT code FROM decant_referral_codes WHERE owner_id = ${ownerId} ORDER BY created_at
  `;
  return rows.map((r) => (r as { code: string }).code);
}

async function positionOf(id: number): Promise<{ position: number; total: number }> {
  const rows = await sql`
    SELECT
      (SELECT count(*)::int FROM decant_waitlist WHERE id <= ${id}) AS position,
      (SELECT count(*)::int FROM decant_waitlist) AS total
  `;
  const r = rows[0] as { position: number; total: number };
  return { position: r.position, total: r.total };
}

async function mintCodes(ownerId: number): Promise<string[]> {
  const out: string[] = [];
  let attempts = 0;
  while (out.length < CODES_PER_SIGNUP && attempts < 50) {
    attempts++;
    const code = generateCode();
    const inserted = await sql`
      INSERT INTO decant_referral_codes (code, owner_id, is_seed, max_uses)
      VALUES (${code}, ${ownerId}, false, ${NEW_CODE_MAX_USES})
      ON CONFLICT (code) DO NOTHING
      RETURNING code
    `;
    if (inserted.length > 0) out.push(code);
  }
  return out;
}

export async function POST(request: Request) {
  if (!(await rateLimit(`join:${clientIp(request)}`, 10, 60_000))) {
    return bad("rate_limited", 429);
  }

  let body: JoinBody;
  try {
    body = (await request.json()) as JoinBody;
  } catch {
    return bad("bad_request");
  }

  // Honeypot — silently reject obvious bots without consuming a code.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return bad("rate_limited", 429);
  }

  const method = body.method;
  if (method !== "wallet" && method !== "email") {
    return bad("invalid_method");
  }

  // 1. Referral code validity
  if (typeof body.code !== "string") return bad("missing_code");
  const code = normalizeCode(body.code);
  if (!isValidCodeFormat(code)) return bad("invalid_code");

  const codeRows = await sql`
    SELECT code, max_uses, uses, active FROM decant_referral_codes WHERE code = ${code} LIMIT 1
  `;
  if (codeRows.length === 0) return bad("code_not_found");
  const codeRow = codeRows[0] as { active: boolean; uses: number; max_uses: number };
  if (!codeRow.active) return bad("code_inactive");
  if (codeRow.uses >= codeRow.max_uses) return bad("code_exhausted");

  const xHandle = body.xHandle ? normalizeHandle(body.xHandle) : null;
  if (body.xHandle && xHandle === null) return bad("invalid_handle");

  // 2. Method-specific validation + duplicate detection
  let walletAddress: string | null = null;
  let email: string | null = null;

  if (method === "wallet") {
    if (typeof body.walletAddress !== "string" || !isValidEvmAddress(body.walletAddress)) {
      return bad("invalid_address");
    }
    if (typeof body.signature !== "string" || typeof body.message !== "string") {
      return bad("missing_signature");
    }
    walletAddress = body.walletAddress.toLowerCase();

    // message must reference this address + code, then verify the signature
    if (
      !body.message.includes(body.walletAddress) ||
      !body.message.includes(code)
    ) {
      return bad("message_mismatch");
    }
    let valid = false;
    try {
      valid = await verifyMessage({
        address: body.walletAddress as `0x${string}`,
        message: body.message,
        signature: body.signature as `0x${string}`,
      });
    } catch {
      valid = false;
    }
    if (!valid) return bad("bad_signature");

    const existing = await sql`
      SELECT id FROM decant_waitlist WHERE lower(wallet_address) = ${walletAddress} LIMIT 1
    `;
    if (existing.length > 0) {
      const id = (existing[0] as { id: number }).id;
      const { position, total } = await positionOf(id);
      return NextResponse.json({
        ok: true,
        already: true,
        position,
        total,
        codes: await ownedCodes(id),
      });
    }
  } else {
    if (typeof body.email !== "string" || !isValidEmail(body.email)) {
      return bad("invalid_email");
    }
    email = body.email.trim().toLowerCase();
    const existing = await sql`
      SELECT id FROM decant_waitlist WHERE lower(email) = ${email} LIMIT 1
    `;
    if (existing.length > 0) {
      const id = (existing[0] as { id: number }).id;
      const { position, total } = await positionOf(id);
      return NextResponse.json({
        ok: true,
        already: true,
        position,
        total,
        codes: await ownedCodes(id),
      });
    }
  }

  // 3. Consume one use of the invite code (guards against over-use)
  const consumed = await sql`
    UPDATE decant_referral_codes
    SET uses = uses + 1
    WHERE code = ${code} AND active = true AND uses < max_uses
    RETURNING code
  `;
  if (consumed.length === 0) return bad("code_exhausted");

  // 4. Insert the signup
  let inserted;
  try {
    inserted = await sql`
      INSERT INTO decant_waitlist (method, wallet_address, email, x_handle, referred_by)
      VALUES (${method}, ${walletAddress}, ${email}, ${xHandle}, ${code})
      RETURNING id
    `;
  } catch {
    // unique index race — refund the code use
    await sql`UPDATE decant_referral_codes SET uses = uses - 1 WHERE code = ${code}`;
    return bad("already_joined", 409);
  }

  const id = (inserted[0] as { id: number }).id;
  const codes = await mintCodes(id);
  const { position, total } = await positionOf(id);

  // Confirmation email (email signups only). No-op without RESEND_API_KEY and
  // never throws, so delivery problems can't fail the signup.
  if (email) {
    await sendWaitlistConfirmation({ to: email, position, codes });
  }

  return NextResponse.json({ ok: true, already: false, position, total, codes });
}
