import { PublicKey } from "@solana/web3.js";
import { NextRequest, NextResponse } from "next/server";
import { isRateLimited, isSameOrigin } from "@/lib/api-security";

const intervals = { "5m": 300, "15m": 900, "1h": 3600, "4h": 14_400 } as const;

export async function GET(request: NextRequest, { params }: { params: { address: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (isRateLimited(request.headers, "market-chart", 60, 60_000)) return NextResponse.json({ error: "Too many chart requests." }, { status: 429 });
  const apiKey = process.env.BIRDEYE_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Market data is not configured." }, { status: 503 });
  const range = request.nextUrl.searchParams.get("range");
  if (!range || !(range in intervals)) return NextResponse.json({ error: "Invalid chart range." }, { status: 400 });
  let address: string;
  try { address = new PublicKey(params.address).toBase58(); } catch { return NextResponse.json({ error: "Invalid Solana address." }, { status: 400 }); }
  const now = Math.floor(Date.now() / 1000);
  const interval = intervals[range as keyof typeof intervals];
  const query = new URLSearchParams({ address, type: range, time_from: String(now - interval * 72), time_to: String(now) });
  try {
    const response = await fetch(`https://public-api.birdeye.so/defi/ohlcv?${query}`, { headers: { "X-API-KEY": apiKey, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
    return NextResponse.json(await response.json(), { status: response.status, headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch { return NextResponse.json({ error: "Chart data is temporarily unavailable." }, { status: 502 }); }
}
