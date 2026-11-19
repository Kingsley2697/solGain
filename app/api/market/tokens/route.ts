import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

const url = "https://public-api.birdeye.so/defi/tokenlist?sort_by=v24hUSD&sort_type=desc&offset=0&limit=30";

export async function GET(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "market-tokens", 60, 60_000)) return NextResponse.json({ error: "Too many market requests." }, { status: 429 });
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Market data is not configured." }, { status: 503 });
  try {
    const response = await fetch(url, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch { return NextResponse.json({ error: "Market data is temporarily unavailable." }, { status: 502 }); }
}
