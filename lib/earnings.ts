import { safeMessage } from "@/lib/http";
import { BASE_HOLDINGS } from "@/lib/data";
import { getDbHoldings, quoteRefFor, looksLikeFund } from "@/lib/holdings";
import { createServiceClient } from "@/lib/supabase/service";

// Shared by app/api/earnings/route.ts (client-facing, small batch — a page
// load shouldn't burn through the whole rate-limit budget) and
// app/api/cron/earnings/route.ts (server-facing, larger batch, runs on a
// schedule so the cache is already warm before anyone opens the tab — see
// that file for why this exists as a cron at all).

type EarningsCacheRow = {
  symbol: string;
  next_date: string | null;
  next_eps_estimate: number | null;
  next_revenue_estimate: number | null;
  history: EarningsQuarter[];
  updated_at: string;
};

export type EarningsQuarter = {
  period: string;
  quarter: number;
  year: number;
  epsActual: number | null;
  epsEstimate: number | null;
  surprisePercent: number | null;
  revenueActual: number | null;
  revenueYoy: number | null;
};

export type SymbolEarnings = {
  symbol: string;
  nextDate: string | null;
  nextEpsEstimate: number | null;
  nextRevenueEstimate: number | null;
  history: EarningsQuarter[];
};

export type EarningsPayload = { asOf: string; earnings: SymbolEarnings[]; errors?: string[] };

async function fetchEarningsCalendar(symbol: string, apiKey: string): Promise<{ date: string; epsEstimate: number | null; revenueEstimate: number | null } | null> {
  const from = new Date().toISOString().slice(0, 10);
  const to = new Date();
  to.setDate(to.getDate() + 180);
  const res = await fetch(
    `https://finnhub.io/api/v1/calendar/earnings?from=${from}&to=${to.toISOString().slice(0, 10)}&symbol=${symbol}&token=${apiKey}`,
    { cache: "no-store" }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Finnhub calendar request failed (${res.status})`);
  // Finnhub doesn't reliably return this sorted soonest-first — for MCD it
  // came back with Q3 (Nov) ahead of the nearer Q2 (Aug) date, so a plain
  // [0] silently picked the wrong quarter. Take the earliest date instead.
  const entries: { date: string; epsEstimate: number | null; revenueEstimate: number | null }[] = json.earningsCalendar ?? [];
  const next = entries.reduce<(typeof entries)[number] | null>((soonest, e) => (!soonest || e.date < soonest.date ? e : soonest), null);
  if (!next) return null;
  return { date: next.date, epsEstimate: next.epsEstimate ?? null, revenueEstimate: next.revenueEstimate ?? null };
}

async function fetchEarningsHistory(symbol: string, apiKey: string): Promise<Omit<EarningsQuarter, "revenueActual" | "revenueYoy">[]> {
  const res = await fetch(`https://finnhub.io/api/v1/stock/earnings?symbol=${symbol}&token=${apiKey}`, { cache: "no-store" });
  const json = await res.json();
  if (!res.ok) throw new Error(`Finnhub earnings-surprise request failed (${res.status})`);
  return (Array.isArray(json) ? json : []).slice(0, 8).map((r) => ({
    period: r.period,
    quarter: r.quarter,
    year: r.year,
    epsActual: typeof r.actual === "number" ? r.actual : null,
    epsEstimate: typeof r.estimate === "number" ? r.estimate : null,
    surprisePercent: typeof r.surprisePercent === "number" ? r.surprisePercent : null,
  }));
}

type PolygonQuarter = { period: string; revenue: number | null };

// Real reported revenue per fiscal quarter, keyed by the quarter's end date
// (matches Finnhub's `period` field, e.g. "2026-06-30") so it can be merged
// into the same history rows. Polygon's financials are standardized from SEC
// filings, which is why revenue is reliably present here — unlike free-cash-
// flow, capital expenditure isn't consistently tagged across companies'
// filings, so it can't be derived the same way.
//
// Fetched with limit=8 (2 years) rather than 4 specifically so revenue YoY
// growth (quarter vs. the same quarter a year earlier) can be computed below —
// Finnhub's free-tier `/stock/earnings` only ever returns the most recent 4
// quarters (confirmed against multiple long-public tickers), so EPS has no
// same-source prior-year point to compare against and doesn't get a YoY figure.
async function fetchPolygonQuarters(symbol: string, apiKey: string): Promise<PolygonQuarter[]> {
  const res = await fetch(
    `https://api.polygon.io/vX/reference/financials?ticker=${symbol}&timeframe=quarterly&limit=8&apiKey=${apiKey}`,
    { cache: "no-store" }
  );
  const json = await res.json();
  if (!res.ok) throw new Error(`Polygon financials request failed (${res.status})`);
  return (json.results ?? [])
    .filter((r: { end_date?: string }) => r.end_date)
    .map((r: { end_date: string; financials?: { income_statement?: { revenues?: { value?: number } } } }) => ({
      period: r.end_date,
      revenue: typeof r.financials?.income_statement?.revenues?.value === "number" ? r.financials.income_statement.revenues.value : null,
    }))
    .sort((a: PolygonQuarter, b: PolygonQuarter) => b.period.localeCompare(a.period));
}

// The same fiscal quarter a year earlier — matched by date proximity (~1 year
// back, ±20 days) rather than "4 array positions back". A positional offset
// breaks for thinly-covered tickers: e.g. STRC (a perpetual preferred that only
// started trading in 2025) returns Strategy Inc.'s real current-quarter revenue
// from Polygon, but with gaps in older quarters, so "index+4" can land on an
// unrelated or missing period and produce a nonsense growth percentage.
function findPriorYearQuarter(quarters: PolygonQuarter[], currentPeriod: string): PolygonQuarter | undefined {
  const targetTime = new Date(`${currentPeriod}T00:00:00Z`).getTime() - 365 * 86400000;
  let best: PolygonQuarter | undefined;
  let bestDiffDays = Infinity;
  for (const q of quarters) {
    if (q.period === currentPeriod) continue;
    const diffDays = Math.abs(new Date(`${q.period}T00:00:00Z`).getTime() - targetTime) / 86400000;
    if (diffDays < bestDiffDays) {
      bestDiffDays = diffDays;
      best = q;
    }
  }
  return bestDiffDays <= 20 ? best : undefined;
}

// Reads the earnings cache, backfills up to `batchSize` stale symbols (each
// symbol needs 2 Finnhub calls + 1 Polygon call, run concurrently across the
// batch — Polygon's free tier is the binding constraint at ~5 req/min, so
// batchSize should stay at or below that), and returns the full merged
// payload plus how many symbols were freshly fetched this call (0 means the
// cache was already fully warm — callers that loop batches use this to stop
// early instead of burning through fixed iterations for nothing).
export async function getEarnings(batchSize: number): Promise<{ payload: EarningsPayload; refreshedCount: number }> {
  const finnhubKey = process.env.FINNHUB_API_KEY;
  const polygonKey = process.env.POLYGON_API_KEY;
  const today = new Date().toISOString().slice(0, 10);

  let holdings: { sym: string; cls: string; name: string }[];
  try {
    const db = await getDbHoldings();
    holdings = db.length ? db : BASE_HOLDINGS;
  } catch {
    holdings = BASE_HOLDINGS;
  }
  const finnhubByDbSymbol = new Map<string, string>();
  for (const h of holdings) {
    if (h.cls !== "Equities") continue;
    if (looksLikeFund(h.sym, h.name)) continue;
    const ref = quoteRefFor(h.sym, h.cls);
    if (ref?.type === "equity") finnhubByDbSymbol.set(h.sym, ref.symbol);
  }
  const dbSymbols = Array.from(finnhubByDbSymbol.keys());

  const errors: string[] = [];
  if (!finnhubKey) {
    return { payload: { asOf: today, earnings: [], errors: ["FINNHUB_API_KEY not set"] }, refreshedCount: 0 };
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = serviceKey ? createServiceClient() : null;
  if (!serviceKey) errors.push("SUPABASE_SERVICE_ROLE_KEY not set — skipping cache");

  const bySymbol = new Map<string, SymbolEarnings>();
  let stale = dbSymbols;
  if (supabase) {
    const { data: cached } = await supabase
      .from("earnings_cache")
      .select("symbol, next_date, next_eps_estimate, next_revenue_estimate, history, updated_at")
      .in("symbol", dbSymbols)
      .returns<EarningsCacheRow[]>();
    for (const row of cached ?? []) {
      if (row.updated_at !== today) continue;
      if (row.next_date === null && row.history.length === 0) continue;
      bySymbol.set(row.symbol, {
        symbol: row.symbol,
        nextDate: row.next_date,
        nextEpsEstimate: row.next_eps_estimate,
        nextRevenueEstimate: row.next_revenue_estimate,
        history: row.history,
      });
    }
    stale = dbSymbols.filter((s) => !bySymbol.has(s));
  }

  let refreshedCount = 0;
  for (const dbSym of stale.slice(0, batchSize)) {
    const finnhubSym = finnhubByDbSymbol.get(dbSym)!;
    try {
      const [nextResult, rawHistoryResult, polygonResult] = await Promise.allSettled([
        fetchEarningsCalendar(finnhubSym, finnhubKey),
        fetchEarningsHistory(finnhubSym, finnhubKey),
        polygonKey ? fetchPolygonQuarters(finnhubSym, polygonKey) : Promise.resolve([] as PolygonQuarter[]),
      ]);
      if (nextResult.status === "rejected") throw nextResult.reason;
      if (rawHistoryResult.status === "rejected") throw rawHistoryResult.reason;
      const next = nextResult.value;
      const rawHistory = rawHistoryResult.value;
      const polygonFailed = polygonResult.status === "rejected";
      const polygonQuarters = polygonResult.status === "fulfilled" ? polygonResult.value : [];
      if (polygonFailed) errors.push(`Polygon: ${finnhubSym} revenue request failed — ${safeMessage(polygonResult.reason)}`);
      const history: EarningsQuarter[] = rawHistory.map((q) => {
        const current = polygonQuarters.find((pq) => pq.period === q.period);
        const priorYear = findPriorYearQuarter(polygonQuarters, q.period);
        const revenueYoy =
          current?.revenue != null && priorYear?.revenue != null && priorYear.revenue !== 0
            ? ((current.revenue - priorYear.revenue) / Math.abs(priorYear.revenue)) * 100
            : null;
        return { ...q, revenueActual: current?.revenue ?? null, revenueYoy };
      });
      const entry: SymbolEarnings = {
        symbol: dbSym,
        nextDate: next?.date ?? null,
        nextEpsEstimate: next?.epsEstimate ?? null,
        nextRevenueEstimate: next?.revenueEstimate ?? null,
        history,
      };
      const isEmpty = entry.nextDate === null && entry.history.length === 0;
      if (!isEmpty) bySymbol.set(dbSym, entry);
      refreshedCount++;
      if (supabase && !polygonFailed) {
        await supabase.from("earnings_cache").upsert({
          symbol: dbSym,
          next_date: entry.nextDate,
          next_eps_estimate: entry.nextEpsEstimate,
          next_revenue_estimate: entry.nextRevenueEstimate,
          history: entry.history,
          updated_at: today,
        });
      }
    } catch (e) {
      errors.push(`Finnhub: ${finnhubSym} request failed — ${safeMessage(e)}`);
    }
  }

  return {
    payload: { asOf: today, earnings: Array.from(bySymbol.values()), ...(errors.length ? { errors } : {}) },
    refreshedCount,
  };
}
