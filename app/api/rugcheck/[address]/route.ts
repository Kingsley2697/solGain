import { Connection, PublicKey } from "@solana/web3.js";
import { NextResponse } from "next/server";
import { isRateLimited } from "@/lib/api-security";

type RugCheckReport = {
  score_normalized?: number;
  score_normalised?: number;
  risks?: { name?: string; level?: string; value?: string; description?: string }[];
  topHolders?: { address?: string; amount?: number; decimals?: number; pct?: number; uiAmount?: number; owner?: string }[];
  markets?: { lp?: { lpLockedPct?: number; lpBurnedPct?: number; lpLockedUSD?: number } }[];
};

export async function GET(request: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  try {
    if (isRateLimited(request.headers, "rugcheck", 30, 60_000)) return NextResponse.json({ error: "Too many safety scans. Please wait a minute." }, { status: 429 });
    const mint = new PublicKey(address);
    const [reportResponse, mintInfo] = await Promise.all([
      fetch(`https://api.rugcheck.xyz/v1/tokens/${mint.toBase58()}/report`, { cache: "no-store", signal: AbortSignal.timeout(8_000) }),
      new Connection(process.env.HELIUS_API_KEY
        ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
        : "https://api.mainnet-beta.solana.com", "confirmed").getParsedAccountInfo(mint),
    ]);
    if (!reportResponse.ok) throw new Error("RugCheck report unavailable");
    const report = (await reportResponse.json()) as RugCheckReport;
    const mintData = mintInfo.value?.data;
    const parsed = mintData && "parsed" in mintData ? mintData.parsed?.info : undefined;
    const holders = (report.topHolders ?? []).slice(0, 10).map(holder => ({
      address: holder.owner || holder.address || "Unknown account",
      amount: Number(holder.uiAmount) || (Number(holder.amount) || 0) / 10 ** (Number(holder.decimals) || 0),
      percentage: Number(holder.pct) || 0,
    }));
    const topHolderPct = holders[0]?.percentage ?? 0;
    const topTenPct = holders.reduce((sum, holder) => sum + holder.percentage, 0);
    const lockedPct = Math.max(0, ...((report.markets ?? []).map(market => Number(market.lp?.lpLockedPct) || Number(market.lp?.lpBurnedPct) || 0)));
    const riskPenalty = (report.risks ?? []).reduce((sum, risk) => sum + (risk.level?.toLowerCase() === "danger" ? 28 : risk.level?.toLowerCase() === "warn" ? 12 : 4), 0);
    const reportedScore = report.score_normalized ?? report.score_normalised;
    const score = typeof reportedScore === "number" ? Math.max(0, Math.min(100, Math.round(reportedScore))) : Math.max(0, 100 - riskPenalty);
    return NextResponse.json({
      score,
      liquidityLocked: lockedPct >= 95,
      liquidityLockedPct: lockedPct,
      mintAuthorityDisabled: !parsed?.mintAuthority,
      freezeAuthorityDisabled: !parsed?.freezeAuthority,
      decimals: Number(parsed?.decimals) || 0,
      topHolderPct,
      topTenPct,
      holders,
      risks: report.risks ?? [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to scan token risk." }, { status: 502 });
  }
}
