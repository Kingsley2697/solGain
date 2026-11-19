import type { MarketToken } from "@/lib/market";

export type MarketScore = { total: number; liquidity: number; activity: number; distribution: number; verification: number; explanation: string[] };

/** A discovery aid, not a prediction or safety rating. Every point is visible to the user. */
export function scoreMarketToken(token: MarketToken): MarketScore {
  const liquidity = token.liquidity ?? 0;
  const activityRatio = liquidity > 0 ? token.volume24h / liquidity : 0;
  const liquidityPoints = liquidity >= 1_000_000 ? 30 : liquidity >= 250_000 ? 24 : liquidity >= 100_000 ? 17 : liquidity >= 25_000 ? 9 : 2;
  const activity = activityRatio >= 1 ? 25 : activityRatio >= .35 ? 19 : activityRatio >= .1 ? 12 : 5;
  const distribution = (token.holders ?? 0) >= 10_000 ? 20 : (token.holders ?? 0) >= 1_000 ? 15 : (token.holders ?? 0) >= 250 ? 9 : 3;
  const verification = token.verified === true ? 15 : 0;
  const marketCap = token.marketCap >= 1_000_000 ? 10 : token.marketCap >= 100_000 ? 6 : 2;
  const explanation = [`${liquidityPoints}/30 liquidity`, `${activity}/25 24h activity`, `${distribution}/20 holders`, `${verification}/15 verification`, `${marketCap}/10 market cap`];
  return { total: liquidityPoints + activity + distribution + verification + marketCap, liquidity: liquidityPoints, activity, distribution, verification, explanation };
}
