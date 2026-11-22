type JsonRecord = Record<string, unknown>;

const dexScreener = "https://api.dexscreener.com/latest/dex";
const geckoTerminal = "https://api.geckoterminal.com/api/v2";

function record(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

function records(value: unknown): JsonRecord[] {
  return (Array.isArray(value) ? value : []).flatMap(item => {
    const result = record(item);
    return result ? [result] : [];
  });
}

function number(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function string(value: unknown) {
  return typeof value === "string" && value.length ? value : undefined;
}

async function getJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json;version=20230203" },
    cache: "no-store",
    signal: AbortSignal.timeout(8_000),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Fallback provider request failed (${response.status})`);
  return payload;
}

type DexPair = {
  chainId?: unknown;
  pairAddress?: unknown;
  baseToken?: unknown;
  quoteToken?: unknown;
  priceUsd?: unknown;
  priceChange?: unknown;
  volume?: unknown;
  liquidity?: unknown;
  marketCap?: unknown;
  fdv?: unknown;
  pairCreatedAt?: unknown;
  info?: unknown;
};

function dexPairs(payload: unknown) {
  return records(record(payload)?.pairs).filter(pair => pair.chainId === "solana") as DexPair[];
}

function tokenFromDexPair(pair: DexPair, requestedAddress?: string): JsonRecord | null {
  const base = record(pair.baseToken);
  const quote = record(pair.quoteToken);
  const requestedIsQuote = requestedAddress && quote?.address === requestedAddress;
  const token = requestedIsQuote ? quote : base;
  const address = string(token?.address);
  const name = string(token?.name);
  const symbol = string(token?.symbol);
  if (!address || !name || !symbol) return null;
  const info = record(pair.info);
  const priceChange = record(pair.priceChange);
  const volume = record(pair.volume);
  const liquidity = record(pair.liquidity);
  return {
    address, name, symbol,
    // DexScreener's priceUsd describes the base token. Quote-token pricing is
    // uncommon for the token pages we resolve; preserve a usable record if it
    // is the only matching pair rather than failing the entire lookup.
    price: number(pair.priceUsd),
    priceChange24hPercent: number(priceChange?.h24),
    v24hUSD: number(volume?.h24),
    mc: number(pair.marketCap ?? pair.fdv),
    fdv: number(pair.fdv) || undefined,
    liquidity: number(liquidity?.usd),
    creationTime: number(pair.pairCreatedAt) || undefined,
    logoURI: string(info?.imageUrl),
  };
}

function bestPair(pairs: DexPair[], address?: string) {
  const matching = address ? pairs.filter(pair => record(pair.baseToken)?.address === address || record(pair.quoteToken)?.address === address) : pairs;
  return [...matching].sort((left, right) => number(record(right.liquidity)?.usd) - number(record(left.liquidity)?.usd))[0];
}

export async function dexToken(address: string) {
  const payload = await getJson(`${dexScreener}/tokens/${encodeURIComponent(address)}`);
  const pair = bestPair(dexPairs(payload), address);
  const token = pair && tokenFromDexPair(pair, address);
  if (!token) throw new Error("DexScreener did not return a Solana market for this token.");
  return { success: true, data: token };
}

export async function dexSearch(query: string) {
  const payload = await getJson(`${dexScreener}/search?q=${encodeURIComponent(query)}`);
  const seen = new Set<string>();
  const items = dexPairs(payload).flatMap(pair => {
    const token = tokenFromDexPair(pair);
    const address = token && string(token.address);
    const name = token && string(token.name);
    const symbol = token && string(token.symbol);
    if (!address || !name || !symbol || seen.has(address)) return [];
    seen.add(address);
    const logoURI = string(token.logoURI);
    return [{ address, name, symbol, ...(logoURI ? { logoURI } : {}) }];
  }).slice(0, 10);
  return { items };
}

function geckoToken(pool: JsonRecord, included: JsonRecord[]) {
  const attributes = record(pool.attributes);
  const relationships = record(pool.relationships);
  const baseToken = record(relationships?.base_token);
  const baseId = string(record(baseToken?.data)?.id);
  const base = included.find(item => item.id === baseId);
  const tokenAttributes = record(base?.attributes);
  const address = string(tokenAttributes?.address) ?? baseId?.replace(/^solana_/, "");
  const name = string(tokenAttributes?.name);
  const symbol = string(tokenAttributes?.symbol);
  if (!address || !name || !symbol) return null;
  const change = record(attributes?.price_change_percentage);
  const volume = record(attributes?.volume_usd);
  return {
    address, name, symbol,
    price: number(attributes?.base_token_price_usd),
    priceChange24hPercent: number(change?.h24),
    v24hUSD: number(volume?.h24),
    mc: number(attributes?.market_cap_usd ?? attributes?.fdv_usd),
    fdv: number(attributes?.fdv_usd) || undefined,
    liquidity: number(attributes?.reserve_in_usd),
    creationTime: string(attributes?.pool_created_at),
    logoURI: string(tokenAttributes?.image_url),
  };
}

export async function geckoTrending(page = 1) {
  const payload = await getJson(`${geckoTerminal}/networks/solana/trending_pools?include=base_token&page=${page}`);
  const root = record(payload);
  const included = records(root?.included);
  const seen = new Set<string>();
  const tokens = records(root?.data).flatMap(pool => {
    const token = geckoToken(pool, included);
    if (!token || seen.has(String(token.address))) return [];
    seen.add(String(token.address));
    return [token];
  });
  if (!tokens.length) throw new Error("GeckoTerminal did not return trending Solana tokens.");
  return tokens;
}

export type ChartRange = "1h" | "24h" | "7d" | "30d" | "90d" | "1y" | "All";

export async function geckoCandles(tokenAddress: string, range: ChartRange) {
  // GeckoTerminal candles are pool-based. DexScreener supplies the best
  // liquid Solana pool for the mint, then Gecko supplies its public OHLCV.
  const dexPayload = await getJson(`${dexScreener}/tokens/${encodeURIComponent(tokenAddress)}`);
  const pair = bestPair(dexPairs(dexPayload), tokenAddress);
  const poolAddress = string(pair?.pairAddress);
  if (!poolAddress) throw new Error("No liquid Solana pool was found for this token.");
  const settings = { "1h": ["minute", 5, 24], "24h": ["minute", 15, 96], "7d": ["hour", 1, 168], "30d": ["hour", 4, 180], "90d": ["hour", 4, 540], "1y": ["day", 1, 365], "All": ["day", 1, 1000] } as const;
  const [timeframe, aggregate, limit] = settings[range];
  const payload = await getJson(`${geckoTerminal}/networks/solana/pools/${encodeURIComponent(poolAddress)}/ohlcv/${timeframe}?aggregate=${aggregate}&limit=${limit}&currency=usd`);
  const ohlcv = record(record(record(payload)?.data)?.attributes)?.ohlcv_list;
  const items = (Array.isArray(ohlcv) ? ohlcv : []).flatMap(value => {
    if (!Array.isArray(value) || value.length < 5) return [];
    const [unixTime, o, h, l, c, v] = value;
    if (![unixTime, o, h, l, c].every(item => Number.isFinite(Number(item)))) return [];
    return [{ unixTime: number(unixTime), o: number(o), h: number(h), l: number(l), c: number(c), v: number(v) }];
  }).sort((left, right) => left.unixTime - right.unixTime);
  if (!items.length) throw new Error("GeckoTerminal did not return chart candles.");
  return { success: true, data: { items } };
}
