const quotaCooldownMs = 5 * 60_000;
let quotaRetryAt = 0;

function message(payload: unknown) {
  const value = payload as { message?: unknown; error?: unknown };
  return typeof value?.message === "string" ? value.message : typeof value?.error === "string" ? value.error : "";
}

export function birdeyeRetryAfterSeconds() {
  return Math.max(0, Math.ceil((quotaRetryAt - Date.now()) / 1_000));
}

export function markBirdeyeQuota(payload: unknown, status?: number) {
  const providerMessage = message(payload);
  if (status === 429 || /compute units|quota|rate limit|too many requests/i.test(providerMessage)) quotaRetryAt = Math.max(quotaRetryAt, Date.now() + quotaCooldownMs);
  return providerMessage;
}

export function birdeyeQuotaError() {
  const seconds = birdeyeRetryAfterSeconds();
  if (!seconds) return null;
  return { error: `Birdeye quota is temporarily exhausted. Retrying in about ${Math.ceil(seconds / 60)} minute(s).`, seconds };
}
