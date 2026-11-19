import { PublicKey } from "@solana/web3.js";
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { alertConditions, type AlertChannels, type AlertCondition, type AlertDestination } from "@/lib/alerts";
import { encryptAlertDestination } from "@/lib/alert-crypto";
import { exceedsContentLength, isRateLimited, isSameOrigin } from "@/lib/api-security";
import { readWalletSession, SESSION_COOKIE } from "@/lib/wallet-auth";

export const runtime = "nodejs";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

function authorize(request: NextRequest, owner: string) {
  try { new PublicKey(owner); } catch { return null; }
  try { if (readWalletSession(request.cookies.get(SESSION_COOKIE)?.value)?.address !== owner) return null; } catch { return null; }
  return client();
}

function validDestination(channels: AlertChannels, destination: AlertDestination) {
  return channels.push === true && Boolean(destination.pushSubscription?.endpoint);
}

export async function GET(request: NextRequest, { params }: { params: { owner: string } }) {
  const supabase = authorize(request, params.owner);
  if (!supabase) return NextResponse.json({ error: "Wallet signature and alert storage configuration are required." }, { status: 401 });
  const { data, error } = await supabase.from("wallet_alerts").select("id,wallet_address,token_address,condition_type,target_value,channels,active,last_observed_value,last_triggered_at,created_at").eq("wallet_address", params.owner).order("created_at", { ascending: false });
  return error ? NextResponse.json({ error: error.message }, { status: 502 }) : NextResponse.json({ alerts: data ?? [] }, { headers: { "Cache-Control": "no-store" } });
}

export async function PUT(request: NextRequest, { params }: { params: { owner: string } }) {
  if (!isSameOrigin(request) || exceedsContentLength(request.headers, 16_000)) return NextResponse.json({ error: "Invalid alert request." }, { status: 400 });
  if (isRateLimited(request.headers, "alerts-write", 20, 60_000)) return NextResponse.json({ error: "Too many alert updates. Please wait a minute." }, { status: 429 });
  const supabase = authorize(request, params.owner);
  if (!supabase) return NextResponse.json({ error: "Wallet signature and alert storage configuration are required." }, { status: 401 });
  const body = await request.json().catch(() => null) as { tokenAddress?: unknown; condition?: unknown; target?: unknown; channels?: unknown; destination?: unknown } | null;
  if (!body || typeof body.tokenAddress !== "string" || !alertConditions.includes(body.condition as AlertCondition) || !Number.isFinite(Number(body.target)) || Number(body.target) < 0 || typeof body.channels !== "object" || !body.channels || typeof body.destination !== "object" || !body.destination) return NextResponse.json({ error: "Invalid alert details." }, { status: 400 });
  try { new PublicKey(body.tokenAddress); } catch { return NextResponse.json({ error: "Invalid token address." }, { status: 400 }); }
  const channels = body.channels as AlertChannels;
  const destination = body.destination as AlertDestination;
  if (!validDestination(channels, destination)) return NextResponse.json({ error: "A valid browser-push subscription is required." }, { status: 400 });
  try {
    const { data, error } = await supabase.from("wallet_alerts").insert({ wallet_address: params.owner, token_address: body.tokenAddress, condition_type: body.condition, target_value: Number(body.target), channels, destination_ciphertext: encryptAlertDestination(destination) }).select("id,wallet_address,token_address,condition_type,target_value,channels,active,last_observed_value,last_triggered_at,created_at").single();
    return error ? NextResponse.json({ error: error.message }, { status: 502 }) : NextResponse.json({ alert: data });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Alert encryption is not configured." }, { status: 503 }); }
}

export async function DELETE(request: NextRequest, { params }: { params: { owner: string } }) {
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Invalid request origin." }, { status: 403 });
  const supabase = authorize(request, params.owner);
  if (!supabase) return NextResponse.json({ error: "Wallet signature and alert storage configuration are required." }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Invalid alert." }, { status: 400 });
  const { error } = await supabase.from("wallet_alerts").delete().eq("id", id).eq("wallet_address", params.owner);
  return error ? NextResponse.json({ error: error.message }, { status: 502 }) : NextResponse.json({ ok: true });
}
