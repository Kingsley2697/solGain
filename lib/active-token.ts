import { SOL_MINT } from "@/lib/jupiter";

const activeTokenKey = "solgain:active-token";
export const activeTokenChanged = "solgain:active-token-changed";

export function getActiveToken() {
  if (typeof window === "undefined") return SOL_MINT;
  return localStorage.getItem(activeTokenKey) || SOL_MINT;
}

export function setActiveToken(address: string) {
  if (typeof window === "undefined" || !address) return;
  localStorage.setItem(activeTokenKey, address);
  window.dispatchEvent(new CustomEvent(activeTokenChanged, { detail: address }));
}
