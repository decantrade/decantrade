// Referral code helpers shared between API routes and seed script.
// Charset excludes ambiguous characters I, L, O, U (Crockford-ish).
export const CODE_CHARSET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const CODE_LENGTH = 8;

const CODE_REGEX = new RegExp(`^[${CODE_CHARSET}]{${CODE_LENGTH}}$`);

export function isValidCodeFormat(code: string): boolean {
  return CODE_REGEX.test(code);
}

export function normalizeCode(code: string): string {
  return code.trim().toUpperCase();
}

export function generateCode(): string {
  const bytes = new Uint8Array(CODE_LENGTH);
  globalThis.crypto.getRandomValues(bytes);
  let out = "";
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARSET[bytes[i] % CODE_CHARSET.length];
  }
  return out;
}

export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254;
}

export function isValidEvmAddress(addr: string): boolean {
  return /^0x[0-9a-fA-F]{40}$/.test(addr);
}

// Base58-encoded Solana public key (32 bytes → 32–44 base58 chars).
// Format check only; cryptographic validity is enforced server-side.
export function isValidSolanaAddress(addr: string): boolean {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(addr);
}

export function normalizeHandle(handle: string): string | null {
  const h = handle.trim().replace(/^@+/, "");
  if (!h) return null;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(h)) return null;
  return h;
}

// Message a wallet signs to prove ownership when joining via wallet.
// Gas-free — verified server-side against the wallet's ed25519 public key.
export function buildWaitlistMessage(
  address: string,
  code: string,
  issuedAt: string,
): string {
  return [
    "Decant — Waitlist verification",
    "",
    "I am joining the Decant waitlist on Solana.",
    "",
    `Address: ${address}`,
    `Invite code: ${code}`,
    `Issued at: ${issuedAt}`,
    "",
    "This signature is gas-free and only proves wallet ownership.",
  ].join("\n");
}
