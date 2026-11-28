const fallbackSiteUrl = "https://sol-gain.vercel.app";

function unwrapUrl(value: string) {
  const trimmed = value.trim();
  const wrapped = trimmed.match(/^(["'])([\s\S]*)\1$/);
  return (wrapped?.[2] ?? trimmed).trim();
}

/** Returns an http(s) URL or null without allowing malformed input to throw. */
export function getSafeHttpUrl(value: string | undefined | null): URL | null {
  const unwrapped = unwrapUrl(value ?? "");
  if (!unwrapped) return null;
  const candidate = /^https?:\/\//i.test(unwrapped) ? unwrapped : `https://${unwrapped.replace(/^\/+/, "")}`;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url : null;
  } catch {
    return null;
  }
}

/** Canonical deployment URL, safe for Next metadata and static generation. */
export function getSafeSiteUrl() {
  return getSafeHttpUrl(process.env.NEXT_PUBLIC_SITE_URL) ?? getSafeHttpUrl(process.env.NEXT_PUBLIC_APP_URL) ?? new URL(fallbackSiteUrl);
}

/** Safe origin parsing for request and referrer URLs, with a canonical fallback. */
export function getSafeOrigin(value: string | undefined | null) {
  return getSafeHttpUrl(value)?.origin ?? getSafeSiteUrl().origin;
}
