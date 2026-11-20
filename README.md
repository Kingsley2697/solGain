# solGain

solGain is a non-custodial Solana token terminal built with Next.js, TypeScript, and Tailwind. It provides a market screener, token research, wallet portfolio view, local-first watchlist, and a two-step quote/review/sign swap flow.

The screener starts with 50 live Birdeye tokens and can load additional 50-token pages. Its search bar accepts any valid Solana mint address and resolves it through the live overview endpoint; for names and tickers outside the loaded list it uses Birdeye token search. Selecting a result opens the same live-chart, watchlist, and Jupiter swap screen used by screener tokens.

## Local development

Requires Node.js 18.17 or newer and a Phantom-compatible Solana wallet for wallet features.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

```env
BIRDEYE_API_KEY=
HELIUS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SECRET_KEY=
WALLET_AUTH_SECRET=
JUPITER_API_KEY=
NEXT_PUBLIC_SITE_URL=
```

Only the Supabase URL is browser-visible. `SUPABASE_SECRET_KEY`, `WALLET_AUTH_SECRET`, Birdeye, Helius, and Jupiter keys stay server-only behind same-origin, rate-limited API routes. Never place a server secret in any `NEXT_PUBLIC_` value. Generate `WALLET_AUTH_SECRET` with `openssl rand -base64 48`. Copy `.env.example` to `.env.local` and populate the values for a new environment.

## Jupiter target orders and DCA

The token screen can create Jupiter Trigger target-price orders and recurring DCA strategies when `JUPITER_API_KEY` is configured. This is deliberately separate from the instant swap flow: Jupiter Trigger authenticates with a wallet-signed challenge, then deposits the selected budget into a Jupiter/Privy-managed vault until the strategy fills or is cancelled. The UI requires an explicit acknowledgement before any deposit transaction is signed. Jupiter validates final minimum-size, interval, and supported-mint rules when the strategy is created.

## Alerts

For a Vercel Hobby deployment, [the alert-worker workflow](.github/workflows/alert-worker.yml) invokes the alert worker every five minutes. Add the same random value as `CRON_SECRET` in both Vercel and the GitHub repository's Actions secrets. Add `ALERT_CRON_URL` as a GitHub Actions secret with the full production URL, such as `https://your-app.vercel.app/api/alerts/run`. Run the workflow manually once after deployment to verify it. Vercel Pro or another scheduler can invoke the same protected route more frequently.

Run [the alert migration](supabase/migrations/20261119000000_create_wallet_alerts.sql) to persist alerts. Users can create price, liquidity, volume, and RugCheck-score alerts delivered only as browser push notifications. Push subscriptions are AES-256-GCM encrypted using `ALERT_ENCRYPTION_KEY` before storage.

Set VAPID subject/public/private keys plus `NEXT_PUBLIC_VAPID_PUBLIC_KEY` for browser push. The protected worker evaluates alerts, sends notifications, records delivery outcomes, and deduplicates threshold crossings. It uses current Birdeye REST data as the safe baseline. For a Birdeye WebSocket-capable plan, deploy a separate long-running broker that writes its streamed token updates into the same evaluation pipeline—the app does not expose provider API keys to browsers.

When no Birdeye key is configured, market data and charts report as unavailable. The application never substitutes simulated prices or charts for live provider data.

## Watchlist security

Watchlists save to browser storage immediately and sync to Supabase in the background when configured. On first sync, the connected wallet signs a one-time, human-readable message; no transaction is created. The server verifies that signature, issues an HTTP-only session cookie bound to that wallet, and performs database requests with the server-only Supabase secret key. Run [the wallet watchlist migration](supabase/migrations/20261118000000_create_wallet_watchlists.sql) in the Supabase SQL Editor. This makes each watchlist follow its wallet across devices without Supabase anonymous sign-ins.

## Production checks

```bash
npm run verify
npm start
```

`verify` runs TypeScript validation, linting, and the production build. The included GitHub Actions workflow runs the same checks on pull requests and pushes to `main`. `GET /api/health` provides a no-cache readiness response without exposing credentials.

## Deployment

Deploy to Vercel or another Node-compatible host, set the environment values there, and serve the site over HTTPS. Set `NEXT_PUBLIC_SITE_URL` to the deployed site URL. solGain includes a content security policy, endpoint input validation, request timeouts, and an in-process rate-limit backstop; use a shared edge/store rate limiter for multi-instance production deployment.

## Risk

solGain is not an exchange, custodian, auditor, or investment adviser. Verify every token address and transaction in your wallet before signing. Safety scores and market data can be delayed, incomplete, or incorrect.
