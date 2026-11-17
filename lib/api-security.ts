type RateLimit = { count: number; resetAt: number };

const buckets = new Map<string, RateLimit>();

export function clientAddress(headers: Headers) {
  return headers.get("x-forwarded-for")?.split(",")[0]?.trim() || headers.get("x-real-ip") || "anonymous";
}

/** A small in-process guard. Deploy a shared edge/store rate limiter for multi-instance production traffic. */
export function isRateLimited(headers: Headers, scope: string, limit: number, windowMs: number) {
  const now = Date.now();
  const key = `${scope}:${clientAddress(headers)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return false; }
  current.count += 1;
  return current.count > limit;
}
