import { NextRequest, NextResponse } from "next/server";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";

const base = "https://api.jup.ag/trigger/v2";

async function upstream(path: string, body: Record<string, unknown>) {
  const apiKey = process.env.JUPITER_API_KEY;
  if (!apiKey) throw new Error("Jupiter Trigger is not configured.");
  const response = await fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "x-api-key": apiKey }, body: JSON.stringify(body), cache: "no-store", signal: AbortSignal.timeout(10_000) });
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) return { error: typeof payload.error === "string" ? payload.error : "Jupiter Trigger rejected the request.", status: response.status };
  return { payload, status: 200 };
}

export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 5_000) || isRateLimited(request.headers, "jupiter-trigger-auth", 12, 60_000)) return NextResponse.json({ error: "Too many authentication requests. Please wait a minute." }, { status: 429 });
  const body = await request.json().catch(() => null) as { action?: unknown; walletPubkey?: unknown; signature?: unknown } | null;
  if (!body || typeof body.walletPubkey !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(body.walletPubkey)) return NextResponse.json({ error: "Invalid wallet address." }, { status: 400 });
  try {
    if (body.action === "challenge") {
      const result = await upstream("/auth/challenge", { walletPubkey: body.walletPubkey, type: "message" });
      return "error" in result ? NextResponse.json({ error: result.error }, { status: result.status }) : NextResponse.json(result.payload, { headers: { "Cache-Control": "no-store" } });
    }
    if (body.action !== "verify" || typeof body.signature !== "string" || !/^[1-9A-HJ-NP-Za-km-z]{64,128}$/.test(body.signature)) return NextResponse.json({ error: "Invalid authentication signature." }, { status: 400 });
    const result = await upstream("/auth/verify", { type: "message", walletPubkey: body.walletPubkey, signature: body.signature });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    const token = result.payload.token;
    if (typeof token !== "string" || token.length > 4_000) return NextResponse.json({ error: "Jupiter returned an invalid session." }, { status: 502 });
    const response = NextResponse.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
    response.cookies.set("solgain_jupiter_trigger", token, { httpOnly: true, sameSite: "strict", secure: process.env.NODE_ENV === "production", path: "/api/jupiter/trigger", maxAge: 23 * 60 * 60 });
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Jupiter Trigger is unavailable." }, { status: 502 });
  }
}
