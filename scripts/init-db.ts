/**
 * Creates Decant's waitlist tables and seeds a batch of invite codes.
 * Run with: pnpm db:init
 */
import postgres from "postgres";
import { generateCode } from "../lib/referral";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error("DATABASE_URL not set");
  process.exit(1);
}

const needsSsl =
  /sslmode=require/.test(connectionString) ||
  /neon\.tech/.test(connectionString) ||
  /supabase\.(co|com)/.test(connectionString);

const sql = postgres(connectionString, {
  ssl: needsSsl ? "require" : false,
  prepare: false,
});

const SEED_COUNT = Number(process.env.SEED_COUNT ?? 12);
const SEED_MAX_USES = Number(process.env.SEED_MAX_USES ?? 100);

async function main() {
  await sql`
    CREATE TABLE IF NOT EXISTS decant_waitlist (
      id           SERIAL PRIMARY KEY,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      method       TEXT NOT NULL CHECK (method IN ('wallet','email')),
      wallet_address TEXT,
      email        TEXT,
      x_handle     TEXT,
      referred_by  TEXT NOT NULL
    )
  `;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS decant_waitlist_wallet_uq ON decant_waitlist (lower(wallet_address)) WHERE wallet_address IS NOT NULL`;
  await sql`CREATE UNIQUE INDEX IF NOT EXISTS decant_waitlist_email_uq ON decant_waitlist (lower(email)) WHERE email IS NOT NULL`;

  await sql`
    CREATE TABLE IF NOT EXISTS decant_referral_codes (
      code       TEXT PRIMARY KEY,
      owner_id   INTEGER REFERENCES decant_waitlist(id) ON DELETE SET NULL,
      is_seed    BOOLEAN NOT NULL DEFAULT false,
      max_uses   INTEGER NOT NULL DEFAULT 3,
      uses       INTEGER NOT NULL DEFAULT 0,
      active     BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `;

  const existing = await sql`
    SELECT code FROM decant_referral_codes WHERE is_seed = true ORDER BY created_at LIMIT 100
  `;

  if (existing.length > 0) {
    console.log(`Seed codes already exist (${existing.length}):`);
    for (const r of existing) console.log("  " + r.code);
    await sql.end();
    return;
  }

  const codes: string[] = [];
  while (codes.length < SEED_COUNT) {
    const c = generateCode();
    if (!codes.includes(c)) codes.push(c);
  }

  for (const code of codes) {
    await sql`
      INSERT INTO decant_referral_codes (code, is_seed, max_uses)
      VALUES (${code}, true, ${SEED_MAX_USES})
      ON CONFLICT (code) DO NOTHING
    `;
  }

  console.log(`Seeded ${codes.length} invite codes (max_uses=${SEED_MAX_USES}):`);
  for (const c of codes) console.log("  " + c);
  await sql.end();
}

main().catch(async (e) => {
  console.error(e);
  try {
    await sql.end();
  } catch {}
  process.exit(1);
});
