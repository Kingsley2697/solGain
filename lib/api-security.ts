type RateLimit = { count: number; resetAt: number };

const buckets = new Map<string, RateLimit>();
const maxBuckets = 10_000;

export function clientAddress(headers: Headers) {
  // These headers are set by their respective trusted edge providers. Do not
  // accept a generic x-forwarded-for header: a direct caller can forge it to
  // bypass a per-IP limit and grow this map without bound.
  return headers.get("x-vercel-forwarded-for") || headers.get("cf-connecting-ip") || "anonymous";
}

export function isSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  // API routes are called only by this browser app. Keep local curl-based
  // development convenient, but require an Origin match in production.
  if (!origin) return process.env.NODE_ENV !== "production";
  return origin === new URL(request.url).origin;
}

export function exceedsContentLength(headers: Headers, maximumBytes: number) {
  const contentLength = headers.get("content-length");
  if (!contentLength) return false;
  const length = Number(contentLength);
  return !Number.isSafeInteger(length) || length > maximumBytes;
}

/** An in-process backstop. Use a shared edge/store limiter for multi-instance traffic. */
export function isRateLimited(headers: Headers, scope: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size >= maxBuckets) {
    for (const [key, bucket] of Array.from(buckets.entries())) if (bucket.resetAt <= now) buckets.delete(key);
    if (buckets.size >= maxBuckets) return true;
  }
  const key = `${scope}:${clientAddress(headers)}`;
  const current = buckets.get(key);
  if (!current || current.resetAt <= now) { buckets.set(key, { count: 1, resetAt: now + windowMs }); return false; }
  current.count += 1;
  return current.count > limit;
}
