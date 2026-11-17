import { VersionedTransaction } from "@solana/web3.js";

export const SOL_MINT = "So11111111111111111111111111111111111111112";

export type JupiterQuote = {
  inputMint: string;
  outputMint: string;
  inAmount: string;
  outAmount: string;
  requestId: string;
  transaction: string;
  priceImpactPct?: string;
  errorMessage?: string;
};

async function requestJson(url: string, options?: RequestInit) {
  const response = await fetch(url, options);
  const payload = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) throw new Error(typeof payload.error === "string" ? payload.error : typeof payload.errorMessage === "string" ? payload.errorMessage : "Jupiter is unavailable.");
  return payload;
}

export async function getJupiterQuote(inputMint: string, outputMint: string, amount: string, slippageBps: number, taker: string) {
  const params = new URLSearchParams({ inputMint, outputMint, amount, slippageBps: String(slippageBps), taker });
  const payload = await requestJson(`/api/jupiter/order?${params}`);
  if (!payload.transaction || !payload.requestId) throw new Error(typeof payload.errorMessage === "string" ? payload.errorMessage : "Jupiter could not build this swap.");
  return payload as unknown as JupiterQuote;
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = "";
  for (let index = 0; index < bytes.length; index += 1) binary += String.fromCharCode(bytes[index]);
  return btoa(binary);
}

export async function executeJupiterSwap(quote: JupiterQuote, signTransaction: (transaction: VersionedTransaction) => Promise<VersionedTransaction>) {
  const bytes = Uint8Array.from(atob(quote.transaction), character => character.charCodeAt(0));
  const transaction = VersionedTransaction.deserialize(bytes);
  const signed = await signTransaction(transaction);
  const payload = await requestJson("/api/jupiter/execute", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ signedTransaction: bytesToBase64(signed.serialize()), requestId: quote.requestId }),
  });
  if (payload.status !== "Success" || typeof payload.signature !== "string") throw new Error(typeof payload.error === "string" ? payload.error : "Jupiter could not confirm this swap.");
  return payload.signature;
}
