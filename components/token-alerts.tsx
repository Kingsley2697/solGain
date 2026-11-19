"use client";

import { Bell, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { useSolanaWallet } from "@/components/wallet-provider";
import { conditionLabel, type AlertChannels, type AlertCondition, type AlertDestination, type WalletAlert } from "@/lib/alerts";
import { ensureWalletSession } from "@/lib/wallet-auth-client";
import type { MarketToken } from "@/lib/market";

function applicationServerKey(value: string) {
  const padded = value + "=".repeat((4 - value.length % 4) % 4);
  const raw = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, character => character.charCodeAt(0));
}

export function TokenAlerts({ token }: { token: MarketToken }) {
  const { publicKey, signMessage } = useSolanaWallet();
  const [alerts, setAlerts] = useState<WalletAlert[]>([]);
  const [condition, setCondition] = useState<AlertCondition>("price_above");
  const [target, setTarget] = useState(token.price > 0 ? token.price.toString() : "");
  const [channels, setChannels] = useState<AlertChannels>({ push: true });
  const [destination, setDestination] = useState<AlertDestination>({});
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!publicKey || !signMessage) return;
    try {
      if (!await ensureWalletSession(publicKey, signMessage)) return;
      const response = await fetch(`/api/alerts/${encodeURIComponent(publicKey)}`, { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { alerts?: WalletAlert[]; error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Could not load alerts.");
      setAlerts((payload.alerts ?? []).filter(alert => alert.token_address === token.address));
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not load alerts."); }
  };
  useEffect(() => { void load(); }, [publicKey, signMessage, token.address]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async () => {
    if (!publicKey || !signMessage) return setMessage("Connect a wallet to save alerts.");
    setBusy(true); setMessage("");
    try {
      if (!await ensureWalletSession(publicKey, signMessage)) throw new Error("Sign the wallet message to save alerts.");
      const nextDestination = { ...destination };
      if (channels.push) {
        if (!("serviceWorker" in navigator) || !process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) throw new Error("Browser push is not configured on this deployment.");
        const registration = await navigator.serviceWorker.ready;
        const subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY) });
        nextDestination.pushSubscription = subscription.toJSON();
      }
      const response = await fetch(`/api/alerts/${encodeURIComponent(publicKey)}`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tokenAddress: token.address, condition, target: Number(target), channels, destination: nextDestination }) });
      const payload = await response.json().catch(() => ({})) as { alert?: WalletAlert; error?: string };
      if (!response.ok || !payload.alert) throw new Error(payload.error ?? "Could not create alert.");
      setAlerts(current => [payload.alert!, ...current]);
      setMessage("Alert saved. It will run when the alert worker is scheduled.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Could not create alert."); }
    finally { setBusy(false); }
  };
  const remove = async (id: string) => {
    if (!publicKey) return;
    const response = await fetch(`/api/alerts/${encodeURIComponent(publicKey)}?id=${encodeURIComponent(id)}`, { method: "DELETE" });
    if (response.ok) setAlerts(current => current.filter(alert => alert.id !== id));
  };

  const targetLabel = condition === "risk_below" ? "Risk score" : condition === "volume_above" ? "USD volume" : condition === "liquidity_below" ? "USD liquidity" : "USD price";
  return <section className="alerts-panel"><div className="panel-title"><strong><Bell size={14} /> Alerts</strong><span>OFF-PAGE READY</span></div><div className="alert-form"><label>Condition<select value={condition} onChange={event => setCondition(event.target.value as AlertCondition)}>{(["price_above", "price_below", "liquidity_below", "volume_above", "risk_below"] as AlertCondition[]).map(item => <option key={item} value={item}>{conditionLabel(item)}</option>)}</select></label><label>{targetLabel}<input type="number" min="0" step="any" value={target} onChange={event => setTarget(event.target.value)} /></label></div><div className="alert-channels"><label><input type="checkbox" checked={Boolean(channels.push)} onChange={event => setChannels(current => ({ ...current, push: event.target.checked }))} /> Browser push</label><label><input type="checkbox" checked={Boolean(channels.telegram)} onChange={event => setChannels(current => ({ ...current, telegram: event.target.checked }))} /> Telegram</label><label><input type="checkbox" checked={Boolean(channels.discord)} onChange={event => setChannels(current => ({ ...current, discord: event.target.checked }))} /> Discord</label><label><input type="checkbox" checked={Boolean(channels.email)} onChange={event => setChannels(current => ({ ...current, email: event.target.checked }))} /> Email</label></div>{channels.telegram && <label className="alert-destination">Telegram chat ID<input value={destination.telegramChatId ?? ""} onChange={event => setDestination(current => ({ ...current, telegramChatId: event.target.value }))} /></label>}{channels.discord && <label className="alert-destination">Discord webhook URL<input type="url" value={destination.discordWebhook ?? ""} onChange={event => setDestination(current => ({ ...current, discordWebhook: event.target.value }))} /></label>}{channels.email && <label className="alert-destination">Email address<input type="email" value={destination.email ?? ""} onChange={event => setDestination(current => ({ ...current, email: event.target.value }))} /></label>}<button className="alert-submit" onClick={() => void create()} disabled={busy}>{busy ? "Saving…" : "Create alert"}</button>{message && <p className="trade-message" role="status">{message}</p>}<div className="alert-list">{alerts.map(alert => <div key={alert.id}><span>{conditionLabel(alert.condition_type)} {alert.target_value}</span><button aria-label="Delete alert" onClick={() => void remove(alert.id)}><Trash2 size={12} /></button></div>)}</div></section>;
}
