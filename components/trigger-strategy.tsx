"use client";

import { useState } from "react";
import { CalendarClock, ExternalLink, ShieldAlert } from "lucide-react";
import { useSolanaWallet } from "@/components/wallet-provider";
import type { MarketToken } from "@/lib/market";
import { authenticateJupiterTrigger, craftJupiterTriggerDeposit, createJupiterTriggerOrder, signJupiterTriggerDeposit } from "@/lib/jupiter-trigger";
import { SOL_MINT } from "@/lib/jupiter";

type Strategy = "limit" | "dca";
type Side = "buy" | "sell";

function toBaseUnits(value: string, decimals: number) {
  const [whole = "0", fraction = ""] = value.trim().split(".");
  if (!/^\d+$/.test(whole) || !/^\d*$/.test(fraction) || fraction.length > decimals) throw new Error("Enter a valid amount.");
  let scale = BigInt(1);
  for (let index = 0; index < decimals; index += 1) scale *= BigInt(10);
  const raw = BigInt(whole) * scale + BigInt((fraction + "0".repeat(decimals)).slice(0, decimals) || "0");
  if (raw <= BigInt(0)) throw new Error("Enter an amount greater than zero.");
  return raw.toString();
}

export function TriggerStrategy({ token, decimals }: { token: MarketToken; decimals?: number }) {
  const { publicKey, connect, signMessage, signTransaction } = useSolanaWallet();
  const [strategy, setStrategy] = useState<Strategy>("limit");
  const [side, setSide] = useState<Side>("buy");
  const [amount, setAmount] = useState("0.5");
  const [target, setTarget] = useState(token.price > 0 ? token.price.toString() : "");
  const [rounds, setRounds] = useState("4");
  const [interval, setInterval] = useState("1440");
  const [acknowledged, setAcknowledged] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [signature, setSignature] = useState("");
  const sellingToken = side === "sell";
  const inputMint = sellingToken ? token.address : SOL_MINT;
  const outputMint = sellingToken ? SOL_MINT : token.address;
  const inputSymbol = sellingToken ? token.symbol : "SOL";
  const inputDecimals = sellingToken ? decimals : 9;

  const createStrategy = async () => {
    setMessage(""); setSignature("");
    if (!publicKey) { try { await connect(); } catch (error) { setMessage(error instanceof Error ? error.message : "Connect a wallet to create a strategy."); } return; }
    if (!signMessage || !signTransaction) return setMessage("This wallet must support message and transaction signing for Jupiter Trigger.");
    if (inputDecimals === undefined) return setMessage("Token metadata is still loading.");
    if (!acknowledged) return setMessage("Acknowledge Jupiter's managed vault before continuing.");
    const amountBaseUnits = toBaseUnits(amount, inputDecimals);
    const triggerPrice = Number(target);
    const orderCount = Number(rounds);
    const intervalSeconds = Number(interval) * 60;
    if (strategy === "limit" && (!Number.isFinite(triggerPrice) || triggerPrice <= 0)) return setMessage("Enter a target USD price.");
    if (strategy === "dca" && (!Number.isInteger(orderCount) || orderCount < 2 || !Number.isInteger(intervalSeconds) || intervalSeconds < 60)) return setMessage("DCA needs at least two rounds and a one-minute interval.");
    setBusy(true);
    try {
      await authenticateJupiterTrigger(publicKey, signMessage);
      const deposit = await craftJupiterTriggerDeposit({ inputMint, outputMint, userAddress: publicKey, amount: amountBaseUnits, orderType: strategy === "limit" ? "single" : "dca" });
      const depositSignedTx = await signJupiterTriggerDeposit(deposit, signTransaction);
      const result = await createJupiterTriggerOrder(strategy === "limit" ? {
        kind: "single", depositRequestId: deposit.requestId, depositSignedTx, userPubkey: publicKey, inputMint, outputMint, inputAmount: amountBaseUnits,
        orderType: "single", triggerMint: token.address, triggerCondition: sellingToken ? "above" : "below", triggerPriceUsd: triggerPrice, slippageBps: 100, expiresAt: Date.now() + 30 * 24 * 60 * 60 * 1000,
      } : {
        kind: "dca", depositRequestId: deposit.requestId, depositSignedTx, userPubkey: publicKey, inputMint, outputMint, inputAmount: amountBaseUnits,
        orderCount, intervalSeconds, orderType: "time_based",
      });
      setSignature(result.txSignature);
      setMessage(`${strategy === "limit" ? "Price order" : "DCA strategy"} is live: ${result.id}`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "Jupiter could not create this strategy."); }
    finally { setBusy(false); }
  };

  return <section className="strategy-panel">
    <div className="panel-title"><strong><CalendarClock size={14} /> Trade strategy</strong><span>JUPITER TRIGGER</span></div>
    <div className="strategy-tabs"><button className={strategy === "limit" ? "selected" : ""} onClick={() => setStrategy("limit")}>Target price</button><button className={strategy === "dca" ? "selected" : ""} onClick={() => setStrategy("dca")}>Recurring DCA</button></div>
    <div className="strategy-tabs compact"><button className={side === "buy" ? "selected" : ""} onClick={() => setSide("buy")}>Buy {token.symbol}</button><button className={side === "sell" ? "selected" : ""} onClick={() => setSide("sell")}>Sell {token.symbol}</button></div>
    <label className="strategy-field"><span>Total deposit ({inputSymbol})</span><input type="number" min="0" step="any" value={amount} onChange={event => setAmount(event.target.value)} /></label>
    {strategy === "limit" ? <label className="strategy-field"><span>Execute when {token.symbol} is {sellingToken ? "at or above" : "at or below"} (USD)</span><input type="number" min="0" step="any" value={target} onChange={event => setTarget(event.target.value)} /></label> : <div className="strategy-fields"><label className="strategy-field"><span>Rounds</span><input type="number" min="2" step="1" value={rounds} onChange={event => setRounds(event.target.value)} /></label><label className="strategy-field"><span>Every (minutes)</span><input type="number" min="1" step="1" value={interval} onChange={event => setInterval(event.target.value)} /></label></div>}
    <div className="strategy-custody"><ShieldAlert size={14} /><span>Jupiter Trigger deposits this budget into a Jupiter/Privy-managed vault until it fills or is cancelled. It is separate from this app&apos;s instant non-custodial swaps.</span></div>
    <label className="trade-acknowledgement"><input type="checkbox" checked={acknowledged} onChange={event => setAcknowledged(event.target.checked)} /> I understand this strategy funds Jupiter&apos;s managed vault and may execute later.</label>
    <button className="strategy-submit" onClick={() => void createStrategy()} disabled={busy || !acknowledged}>{busy ? "Preparing strategy…" : strategy === "limit" ? "Create target order" : "Create recurring DCA"}</button>
    {message && <p className="trade-message" role="status">{message}</p>}{signature && <a className="trade-success" href={`https://solscan.io/tx/${signature}`} target="_blank" rel="noreferrer">View deposit <ExternalLink size={12} /></a>}
  </section>;
}
