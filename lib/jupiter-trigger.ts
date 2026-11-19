import { VersionedTransaction } from "@solana/web3.js";
import { base58Encode } from "@/lib/base58";

type Json = Record<string, unknown>;
export type TriggerKind = "single" | "dca";
export type TriggerDeposit = { requestId: string; transaction: string };

async function request(url: string, body: Json) {
  const response = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : "Jupiter Trigger is unavailable.");
  return payload;
}

function encodeTransaction(transaction: VersionedTransaction) {
  let binary = "";
  const bytes = transaction.serialize();
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export async function authenticateJupiterTrigger(owner: string, signMessage: (message: Uint8Array) => Promise<Uint8Array>) {
  const challenge = await request("/api/jupiter/trigger/auth", { action: "challenge", walletPubkey: owner });
  if (typeof challenge.challenge !== "string") throw new Error("Jupiter did not return an authentication challenge.");
  const signature = await signMessage(new TextEncoder().encode(challenge.challenge));
  await request("/api/jupiter/trigger/auth", { action: "verify", walletPubkey: owner, signature: base58Encode(signature) });
}

export async function craftJupiterTriggerDeposit(input: { inputMint: string; outputMint: string; userAddress: string; amount: string; orderType: TriggerKind }) {
  const payload = await request("/api/jupiter/trigger/deposit", input);
  if (typeof payload.requestId !== "string" || typeof payload.transaction !== "string") throw new Error("Jupiter could not prepare the vault deposit.");
  return payload as unknown as TriggerDeposit;
}

export async function signJupiterTriggerDeposit(deposit: TriggerDeposit, signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>) {
  const bytes = Uint8Array.from(atob(deposit.transaction), character => character.charCodeAt(0));
  return encodeTransaction(await signTransaction(VersionedTransaction.deserialize(bytes)));
}

export async function createJupiterTriggerOrder(payload: Json) {
  const result = await request("/api/jupiter/trigger/order", payload);
  if (typeof result.id !== "string") throw new Error(typeof result.error === "string" ? result.error : "Jupiter did not create the strategy.");
  return { id: result.id, txSignature: typeof result.txSignature === "string" ? result.txSignature : "" };
}
