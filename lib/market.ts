export type MarketToken = {
  address: string;
  name: string;
  symbol: string;
  price: number;
  change: number;
  changeWindow: "1h" | "24h";
  volume24h: number;
  marketCap: number;
  holders?: number;
  liquidity?: number;
  logoURI?: string;
  color: string;
};
