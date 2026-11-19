import { createClient } from "@supabase/supabase-js";
import webpush from "web-push";
import { NextRequest, NextResponse } from "next/server";
import { decryptAlertDestination } from "@/lib/alert-crypto";
import type { AlertChannels, AlertCondition, AlertDestination } from "@/lib/alerts";

export const runtime = "nodejs";
type AlertRow = { id: string; wallet_address: string; token_address: string; condition_type: AlertCondition; target_value: number; channels: AlertChannels; destination_ciphertext: string | null; last_observed_value: number | null; last_triggered_at: string | null };
type Market = { price: number; liquidity: number; volume: number };

function database() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }) : null;
}

async function market(address: string): Promise<Market | null> {
  const key = process.env.BIRDEYE_API_KEY;
  if (!key) return null;
  const response = await fetch(`https://public-api.birdeye.so/defi/token_overview?address=${encodeURIComponent(address)}`, { headers: { "X-API-KEY": key, "x-chain": "solana" }, cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => ({})) as { data?: { price?: unknown; liquidity?: unknown; v24hUSD?: unknown } };
  if (!response.ok || !payload.data) return null;
  return { price: Number(payload.data.price) || 0, liquidity: Number(payload.data.liquidity) || 0, volume: Number(payload.data.v24hUSD) || 0 };
}

async function risk(address: string) {
  const response = await fetch(`https://api.rugcheck.xyz/v1/tokens/${encodeURIComponent(address)}/report`, { cache: "no-store", signal: AbortSignal.timeout(8_000) });
  const payload = await response.json().catch(() => ({})) as { score_normalized?: unknown; score_normalised?: unknown };
  return response.ok ? Number(payload.score_normalized ?? payload.score_normalised) : NaN;
}

function matched(condition: AlertCondition, value: number, target: number, previous: number | null) {
  if (!Number.isFinite(value)) return false;
  if (condition === "price_above" || condition === "volume_above") return value >= target && (previous === null || previous < target);
  return value <= target && (previous === null || previous > target);
}

async function deliver(channels: AlertChannels, destination: AlertDestination, title: string, body: string, url: string) {
  const results: { channel: string; status: "sent" | "failed"; detail?: string }[] = [];
  const send = async (channel: string, request: () => Promise<Response | void>) => { try { const response = await request(); results.push({ channel, status: !response || response.ok ? "sent" : "failed", detail: response && !response.ok ? String(response.status) : undefined }); } catch (error) { results.push({ channel, status: "failed", detail: error instanceof Error ? error.message.slice(0, 180) : "Delivery failed" }); } };
  if (channels.push && destination.pushSubscription && process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    webpush.setVapidDetails(process.env.VAPID_SUBJECT, process.env.VAPID_PUBLIC_KEY, process.env.VAPID_PRIVATE_KEY);
    await send("push", async () => { await webpush.sendNotification(destination.pushSubscription! as Parameters<typeof webpush.sendNotification>[0], JSON.stringify({ title, body, url })); });
  }
  return results;
}

export async function GET(request: NextRequest) {
  if (!process.env.ALERT_CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.ALERT_CRON_SECRET}`) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const supabase = database();
  if (!supabase) return NextResponse.json({ error: "Alert storage is not configured." }, { status: 503 });
  const { data, error } = await supabase.from("wallet_alerts").select("id,wallet_address,token_address,condition_type,target_value,channels,destination_ciphertext,last_observed_value,last_triggered_at").eq("active", true).limit(200);
  if (error) return NextResponse.json({ error: error.message }, { status: 502 });
  const cache = new Map<string, Market | null>();
  let triggered = 0;
  for (const alert of (data ?? []) as AlertRow[]) {
    let current: number;
    if (alert.condition_type === "risk_below") current = await risk(alert.token_address);
    else {
      if (!cache.has(alert.token_address)) cache.set(alert.token_address, await market(alert.token_address));
      const value = cache.get(alert.token_address);
      current = alert.condition_type === "liquidity_below" ? value?.liquidity ?? NaN : alert.condition_type === "volume_above" ? value?.volume ?? NaN : value?.price ?? NaN;
    }
    const fires = matched(alert.condition_type, current, Number(alert.target_value), alert.last_observed_value);
    await supabase.from("wallet_alerts").update({ last_observed_value: current, updated_at: new Date().toISOString(), ...(fires ? { last_triggered_at: new Date().toISOString() } : {}) }).eq("id", alert.id);
    if (!fires) continue;
    triggered += 1;
    try {
      const destination = decryptAlertDestination<AlertDestination>(alert.destination_ciphertext) ?? { pushSubscription: {} };
      const title = "solGain market alert";
      const body = `${alert.condition_type.replace(/_/g, " ")}: ${current.toLocaleString("en-US", { maximumFractionDigits: 8 })} (target ${Number(alert.target_value).toLocaleString()})`;
      const outcomes = await deliver(alert.channels, destination, title, body, `/token/${alert.token_address}`);
      if (outcomes.length) await supabase.from("wallet_alert_deliveries").insert(outcomes.map(outcome => ({ alert_id: alert.id, channel: outcome.channel, observed_value: current, status: outcome.status, detail: outcome.detail ?? null })));
    } catch (error) { await supabase.from("wallet_alert_deliveries").insert({ alert_id: alert.id, channel: "worker", observed_value: current, status: "failed", detail: error instanceof Error ? error.message.slice(0, 180) : "Delivery configuration failed" }); }
  }
  return NextResponse.json({ processed: data?.length ?? 0, triggered }, { headers: { "Cache-Control": "no-store" } });
}
