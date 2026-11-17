# solGain

solGain is a non-custodial Solana token terminal built with Next.js, TypeScript, and Tailwind. It provides a market screener, token research, wallet portfolio view, local-first watchlist, and a two-step quote/review/sign swap flow.

## Local development

Requires Node.js 18.17 or newer and a Phantom-compatible Solana wallet for wallet features.

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Environment

```env
NEXT_PUBLIC_BIRDEYE_API_KEY=
NEXT_PUBLIC_HELIUS_API_KEY=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
JUPITER_API_KEY=
```

Public `NEXT_PUBLIC_` values are exposed to browsers. Never place a wallet secret or Supabase service-role key in them. `JUPITER_API_KEY` is server-only.

When no Birdeye key is configured, market data and charts are clearly labelled as simulated preview data. A failed live chart is shown as unavailable rather than substituted with simulated data.

## Watchlist security

Watchlists use browser storage when Supabase is absent or rejects a request. A wallet address submitted from browser code is not proof of wallet ownership. Do not enable unrestricted anonymous Supabase read/write policies for a public deployment; use an authenticated, signed-wallet session before enabling remote sync.

## Production checks

```bash
npm run verify
npm start
```

`verify` runs TypeScript validation, linting, and the production build. The included GitHub Actions workflow runs the same checks on pull requests and pushes to `main`.

## Deployment

Deploy to Vercel or another Node-compatible host, set the environment values there, and serve the site over HTTPS. Set `NEXT_PUBLIC_SITE_URL` to the deployed site URL. solGain includes baseline security headers, endpoint input validation, and in-process rate limiting; use a shared edge/store rate limiter for a multi-instance production deployment.

## Risk

solGain is not an exchange, custodian, auditor, or investment adviser. Verify every token address and transaction in your wallet before signing. Safety scores and market data can be delayed, incomplete, or incorrect.
