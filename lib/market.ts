import { BASE_HOLDINGS } from "./data";

// Live market data, callable in-process. Both /api/quotes and the weekly cron
// use this directly — the cron must not call /api/quotes over HTTP, because
// that route sits behind the session middleware and a scheduled run carries no
// cookie, so the call would 401 and silently fall back to stale seed values.

const CRYPTO_IDS: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  LINK: "chainlink",
  HYPE: "hyperliquid",
};

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

// Finnhub quotes OANDA:EUR_USD as USD per EUR. Forex requires a paid Finnhub
// tier, so this returns null on the free plan.
async function fetchFinnhubEurUsd(apiKey: string): Promise<number | null> {
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:EUR_USD&token=${apiKey}`, { cache: "no-store" });
  const json = await res.json();
  return typeof json.c === "number" && json.c > 0 ? json.c : null;
}

async function fetchCoinGeckoQuotes(symbols: string[], apiKey: string | undefined): Promise<Record<string, Quote>> {
  const ids = symbols.map((s) => CRYPTO_IDS[s]).join(",");
  const res = await fetch(
    `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true`,
    { headers: apiKey ? { "x-cg-demo-api-key": apiKey } : {}, cache: "no-store" }
  );
  const json = await res.json();
  const out: Record<string, Quote> = {};
  for (const sym of symbols) {
    const entry = json[CRYPTO_IDS[sym]];
    if (entry && typeof entry.usd === "number") {
      out[sym] = { price: entry.usd, day: typeof entry.usd_24h_change === "number" ? entry.usd_24h_change : 0 };
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

  const symbols = Array.from(new Set(BASE_HOLDINGS.filter((h) => h.qty).map((h) => h.sym)));
  const cryptoSymbols = symbols.filter((s) => s in CRYPTO_IDS);
  const equitySymbols = symbols.filter((s) => !(s in CRYPTO_IDS));

  if (finnhubKey) {
    await Promise.all(
      equitySymbols.map(async (sym) => {
        try {
          const q = await fetchFinnhubQuote(sym, finnhubKey);
          if (q) quotes[sym] = q;
          else errors.push(`Finnhub: no quote for ${sym}`);
        } catch {
          errors.push(`Finnhub: ${sym} request failed`);
        }
      })
    );
  } else {
    errors.push("FINNHUB_API_KEY not set");
  }

  if (cryptoSymbols.length) {
    try {
      Object.assign(quotes, await fetchCoinGeckoQuotes(cryptoSymbols, coingeckoKey));
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
