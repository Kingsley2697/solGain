"use client";

export type SignMessage = (message: Uint8Array) => Promise<Uint8Array>;

let authenticatedAddress = "";
let pending: Promise<boolean> | null = null;

function signatureToBase64(signature: Uint8Array) {
  let binary = "";
  for (let index = 0; index < signature.length; index += 1) binary += String.fromCharCode(signature[index]);
  return btoa(binary);
}

export async function ensureWalletSession(address: string, signMessage?: SignMessage) {
  if (!address || !signMessage) return false;
  if (authenticatedAddress === address) return true;
  if (pending) return pending;
  pending = (async () => {
    const existing = await fetch("/api/auth/session", { cache: "no-store" }).then(response => response.ok ? response.json() as Promise<{ walletAddress?: string }> : null).catch(() => null);
    if (existing?.walletAddress === address) { authenticatedAddress = address; return true; }

    const nonceResponse = await fetch("/api/auth/nonce", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ address }),
    });
    const noncePayload = await nonceResponse.json().catch(() => ({})) as { message?: string; error?: string };
    if (!nonceResponse.ok || !noncePayload.message) throw new Error(noncePayload.error ?? "Could not start wallet sign-in.");

    const signature = await signMessage(new TextEncoder().encode(noncePayload.message));
    const verifyResponse = await fetch("/api/auth/verify", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ address, message: noncePayload.message, signature: signatureToBase64(signature) }),
    });
    const verifyPayload = await verifyResponse.json().catch(() => ({})) as { error?: string };
    if (!verifyResponse.ok) throw new Error(verifyPayload.error ?? "Wallet signature could not be verified.");
    authenticatedAddress = address;
    return true;
  })();
  try { return await pending; }
  finally { pending = null; }
}

export function clearWalletSession(address?: string) {
  if (!address || authenticatedAddress === address) authenticatedAddress = "";
}
