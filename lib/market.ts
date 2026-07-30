import { safeMessage } from "@/lib/http";
import { BASE_HOLDINGS } from "./data";
import { getDbHoldings, quoteRefFor } from "./holdings";

// Live market data, callable in-process. Both /api/quotes and the weekly cron
// use this directly — the cron must not call /api/quotes over HTTP, because
// that route sits behind the session middleware and a scheduled run carries no
// cookie, so the call would 401 and silently fall back to stale seed values.

const CACHE_TTL_MS = 30_000;

export type Quote = { price: number; day: number };
export type QuotesPayload = {
  asOf: string;
  quotes: Record<string, Quote>;
  eurusd: number | null;
  errors?: string[];
};

let cache: { data: QuotesPayload; expires: number } | null = null;

async function fetchFinnhubQuote(symbol: string, apiKey: string): Promise<Quote | null> {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`, {
    cache: "no-store",
  });
  const json = await res.json();
  if (typeof json.c !== "number" || json.c <= 0) return null;
  return { price: json.c, day: typeof json.dp === "number" ? json.dp : 0 };
}

// Finnhub's free tier only covers stocks/ETFs — mutual funds (e.g. VFIAX,
// DFIEX) 403. Yahoo's unofficial chart endpoint has no key and covers mutual
// fund NAV, so it's the fallback whenever Finnhub has no quote.
async function fetchYahooQuote(symbol: string): Promise<Quote | null> {
  const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  const json = await res.json();
  const meta = json?.chart?.result?.[0]?.meta;
  const price = meta?.regularMarketPrice;
  const prevClose = meta?.chartPreviousClose ?? meta?.previousClose;
  if (typeof price !== "number" || price <= 0) return null;
  const day = typeof prevClose === "number" && prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0;
  return { price, day };
}

// Finnhub quotes OANDA:EUR_USD as USD per EUR. Forex requires a paid Finnhub
// tier, so this returns null on the free plan.
async function fetchFinnhubEurUsd(apiKey: string): Promise<number | null> {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:EUR_USD&token=${apiKey}`, { cache: "no-store" });
  const json = await res.json();
  return typeof json.c === "number" && json.c > 0 ? json.c : null;
}

// `wanted` maps a CoinGecko id to the holding symbols that resolve to it, so
// results come back keyed by the symbol the dashboard actually holds
// (e.g. both "BTC" and "BTC.USD-PAXOS" resolve to bitcoin).
async function fetchCoinGeckoQuotes(
  wanted: Map<string, string[]>,
  apiKey: string | undefined
): Promise<Record<string, Quote>> {
  const ids = Array.from(wanted.keys()).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { headers: apiKey ? { "x-cg-demo-api-key": apiKey } : {}, cache: "no-store" }
  );
  const json = await res.json();
  const out: Record<string, Quote> = {};
  for (const [id, symbols] of Array.from(wanted.entries())) {
    const entry = json[id];
    if (entry && typeof entry.usd === "number") {
      const quote = { price: entry.usd, day: typeof entry.usd_24h_change === "number" ? entry.usd_24h_change : 0 };
      for (const sym of symbols) out[sym] = quote;
    }
  }
  return out;
}

export async function getQuotes({ force = false }: { force?: boolean } = {}): Promise<QuotesPayload> {
  if (!force && cache && cache.expires > Date.now()) return cache.data;

  const finnhubKey = process.env.FINNHUB_API_KEY;
  const coingeckoKey = process.env.COINGECKO_API_KEY;
  const errors: string[] = [];
  const quotes: Record<string, Quote> = {};

  // Price whatever is actually held. Falls back to the seed list only if the
  // database is empty or unreachable.
  let priceable: { sym: string; cls: string }[];
  try {
    const db = await getDbHoldings();
    priceable = db.length
      ? db.filter((h) => h.qty).map((h) => ({ sym: h.sym, cls: h.cls }))
      : BASE_HOLDINGS.filter((h) => h.qty).map((h) => ({ sym: h.sym, cls: h.cls }));
  } catch (e) {
    errors.push(`holdings lookup failed, pricing seed symbols — ${safeMessage(e)}`);
    priceable = BASE_HOLDINGS.filter((h) => h.qty).map((h) => ({ sym: h.sym, cls: h.cls }));
  }

  // Resolve each held symbol to its provider ticker, deduping so two holdings
  // of the same asset cost one request.
  const cryptoWanted = new Map<string, string[]>();
  const equityWanted = new Map<string, string[]>();
  for (const { sym, cls } of priceable) {
    const ref = quoteRefFor(sym, cls);
    if (!ref) continue;
    const target = ref.type === "crypto" ? cryptoWanted : equityWanted;
    const key = ref.type === "crypto" ? ref.id : ref.symbol;
    target.set(key, [...(target.get(key) ?? []), sym]);
  }

  if (finnhubKey) {
    await Promise.all(
      Array.from(equityWanted.entries()).map(async ([finnhubSymbol, heldAs]) => {
        try {
          const q = (await fetchFinnhubQuote(finnhubSymbol, finnhubKey)) ?? (await fetchYahooQuote(finnhubSymbol).catch(() => null));
          if (q) for (const sym of heldAs) quotes[sym] = q;
          else errors.push(`no quote for ${finnhubSymbol} (tried Finnhub and Yahoo)`);
        } catch {
          errors.push(`${finnhubSymbol} request failed`);
        }
      })
    );
  } else {
    errors.push("FINNHUB_API_KEY not set");
  }

  if (cryptoWanted.size) {
    try {
      Object.assign(quotes, await fetchCoinGeckoQuotes(cryptoWanted, coingeckoKey));
    } catch {
      errors.push("CoinGecko: request failed");
    }
  }

  let eurusd: number | null = null;
  if (finnhubKey) {
    try {
      eurusd = await fetchFinnhubEurUsd(finnhubKey);
      if (eurusd === null) errors.push("Finnhub: no EURUSD quote");
    } catch {
      errors.push("Finnhub: EURUSD request failed");
    }
  }

  const payload: QuotesPayload = {
    asOf: new Date().toISOString(),
    quotes,
    eurusd,
    ...(errors.length ? { errors } : {}),
  };
  cache = { data: payload, expires: Date.now() + CACHE_TTL_MS };
  return payload;
}
