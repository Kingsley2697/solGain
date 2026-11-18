import { NextRequest, NextResponse } from "next/server";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";

const JUPITER_EXECUTE_URL = "https://api.jup.ag/swap/v2/execute";

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "jupiter-execute", 10, 60_000)) return NextResponse.json({ error: "Too many swap submissions. Please wait a minute." }, { status: 429 });
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Add JUPITER_API_KEY to enable swaps." }, { status: 503 });

  if (exceedsContentLength(request.headers, 25_000)) return NextResponse.json({ error: "Swap request is too large." }, { status: 413 });
  const body = await request.json().catch(() => null) as { signedTransaction?: unknown; requestId?: unknown } | null;
  if (!body || typeof body.signedTransaction !== "string" || typeof body.requestId !== "string" || body.signedTransaction.length > 20_000 || body.requestId.length > 200 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.signedTransaction)) return NextResponse.json({ error: "Invalid signed swap request." }, { status: 400 });

  try {
    const upstream = await fetch(JUPITER_EXECUTE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey },
      body: JSON.stringify(body),
      cache: "no-store",
      signal: AbortSignal.timeout(12_000),
    });
    const payload = await upstream.json().catch(() => ({}));
    return NextResponse.json(payload, { status: upstream.status });
  } catch {
    return NextResponse.json({ error: "Swap submission is temporarily unavailable." }, { status: 502 });
  }
}
