"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="token-loading"><strong>Something went wrong</strong><span>We could not load this view. Your wallet and private keys remain under your control.</span><button className="connect-cta" onClick={reset}>Try again</button></main>;
}
