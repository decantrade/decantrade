import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Server-side Solana RPC proxy. The upstream RPC URL (with its API key) is a
// Worker secret (SOLANA_RPC_URL) and is never exposed to the browser — the
// client points NEXT_PUBLIC_RPC_URL at this same-origin endpoint.
const FALLBACK = "https://api.devnet.solana.com";

function upstream(): string {
  return process.env.SOLANA_RPC_URL || FALLBACK;
}

export async function POST(req: Request) {
  let body: string;
  try {
    body = await req.text();
  } catch {
    return NextResponse.json({ error: "bad request" }, { status: 400 });
  }
  try {
    const res = await fetch(upstream(), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body,
    });
    const text = await res.text();
    return new NextResponse(text, {
      status: res.status,
      headers: { "content-type": "application/json" },
    });
  } catch {
    return NextResponse.json(
      { error: "rpc upstream unreachable" },
      { status: 502 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ ok: true });
}
