import { Connection, VersionedTransaction } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";

export const runtime = "nodejs";

function rpcUrl() {
  const key = process.env.HELIUS_API_KEY;
  return key ? `https://mainnet.helius-rpc.com/?api-key=${encodeURIComponent(key)}` : "https://api.mainnet-beta.solana.com";
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 25_000)) return NextResponse.json({ error: "Simulation request is too large." }, { status: 413 });
  if (isRateLimited(request.headers, "jupiter-simulate", 15, 60_000)) return NextResponse.json({ error: "Too many simulation requests. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null) as { transaction?: unknown } | null;
  if (!body || typeof body.transaction !== "string" || body.transaction.length > 20_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.transaction)) return NextResponse.json({ error: "Invalid swap transaction." }, { status: 400 });
  try {
    const transaction = VersionedTransaction.deserialize(Buffer.from(body.transaction, "base64"));
    const connection = new Connection(rpcUrl(), "confirmed");
    const simulation = await connection.simulateTransaction(transaction, { sigVerify: false, replaceRecentBlockhash: true, commitment: "processed" });
    const error = simulation.value.err ? JSON.stringify(simulation.value.err) : null;
    return NextResponse.json({ ok: !error, error, unitsConsumed: simulation.value.unitsConsumed ?? null, logs: simulation.value.logs?.slice(-8) ?? [] }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The swap could not be simulated. Request a fresh quote before signing." }, { status: 422 });
  }
}
