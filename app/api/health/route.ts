import { NextResponse } from "next/server";

export function GET() {
  return NextResponse.json({
    status: "ok",
    services: {
      marketData: Boolean(process.env.BIRDEYE_API_KEY || process.env.NEXT_PUBLIC_BIRDEYE_API_KEY),
      portfolioData: Boolean(process.env.HELIUS_API_KEY || process.env.NEXT_PUBLIC_HELIUS_API_KEY),
      swaps: Boolean(process.env.JUPITER_API_KEY),
      watchlistSync: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
      alerts: Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SECRET_KEY && process.env.ALERT_ENCRYPTION_KEY && process.env.ALERT_CRON_SECRET),
      browserPush: Boolean(process.env.VAPID_SUBJECT && process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY),
    },
  }, { headers: { "Cache-Control": "no-store" } });
}
