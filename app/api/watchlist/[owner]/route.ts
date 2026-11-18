import { NextRequest, NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";
import { readWalletSession, SESSION_COOKIE } from "@/lib/wallet-auth";

export const runtime = "nodejs";

function serverClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function authorize(request: NextRequest, owner: string) {
  try { new PublicKey(owner); } catch { return { error: NextResponse.json({ error: "Invalid Solana wallet address." }, { status: 400 }) }; }
  try {
    const session = readWalletSession(request.cookies.get(SESSION_COOKIE)?.value);
    if (!session || session.address !== owner) return { error: NextResponse.json({ error: "Wallet signature is required." }, { status: 401 }) };
  } catch { return { error: NextResponse.json({ error: "Wallet sign-in is not configured." }, { status: 503 }) }; }
  const supabase = serverClient();
  if (!supabase) return { error: NextResponse.json({ error: "Watchlist sync is not configured." }, { status: 503 }) };
  return { supabase };
}

function tokenAddress(body: unknown) {
  const token = body as { tokenAddress?: unknown };
  if (typeof token?.tokenAddress !== "string") return null;
  try { new PublicKey(token.tokenAddress); return token.tokenAddress; } catch { return null; }
}

export async function GET(request: NextRequest, { params }: { params: { owner: string } }) {
  const access = authorize(request, params.owner);
  if ("error" in access) return access.error;
  const { data, error } = await access.supabase.from("wallet_watchlists").select("token_address").eq("wallet_address", params.owner).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ addresses: (data ?? []).map(row => row.token_address) }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest, { params }: { params: { owner: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 2_048)) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  if (isRateLimited(request.headers, "watchlist-write", 40, 60_000)) return NextResponse.json({ error: "Too many watchlist changes. Please wait a minute." }, { status: 429 });
  const access = authorize(request, params.owner);
  if ("error" in access) return access.error;
  const address = tokenAddress(await request.json().catch(() => null));
  if (!address) return NextResponse.json({ error: "Invalid token address." }, { status: 400 });
  const { error } = await access.supabase.from("wallet_watchlists").upsert({ wallet_address: params.owner, token_address: address }, { onConflict: "wallet_address,token_address", ignoreDuplicates: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest, { params }: { params: { owner: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  if (exceedsContentLength(request.headers, 2_048)) return NextResponse.json({ error: "Request is too large." }, { status: 413 });
  const access = authorize(request, params.owner);
  if ("error" in access) return access.error;
  const address = tokenAddress(await request.json().catch(() => null));
  if (!address) return NextResponse.json({ error: "Invalid token address." }, { status: 400 });
  const { error } = await access.supabase.from("wallet_watchlists").delete().eq("wallet_address", params.owner).eq("token_address", address);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  return NextResponse.json({ ok: true });
}
