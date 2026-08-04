import { jsonNoStore, safeMessage } from "@/lib/http";
import { BASE_HOLDINGS } from "@/lib/data";
import { getDbHoldings, quoteRefFor, looksLikeFund } from "@/lib/holdings";
import { createServiceClient } from "@/lib/supabase/service";

// Next earnings date + analyst estimates, and actual-vs-estimate results for
// the last several quarters, for individual companies held (funds/ETFs
// excluded — they don't have an earnings call to report on). Finnhub's free
// tier has no earnings-call transcript access, so this is the reported
// numbers (EPS/revenue actual vs estimate, surprise %), not a summary of
// what was said on the call.
export const dynamic = "force-dynamic";

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

export async function GET() {
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
  // Cache and output are keyed on the original holdings symbol (e.g. "BRK B"),
  // not the Finnhub dialect ("BRK.B") — otherwise a share-class ticker with a
  // space caches under a key nothing else in the app recognises, and the
  // component's holdings-name lookup (keyed on the DB symbol) silently misses.
  // Funds/ETFs are excluded entirely — they don't report earnings.
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
    return jsonNoStore({ asOf: today, earnings: [], errors: ["FINNHUB_API_KEY not set"] });
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
      // Same "nothing here" guard as the fetch path below — a cached empty
      // result (e.g. a private/illiquid manual position) stays marked fresh
      // so it isn't retried, but shouldn't render as an entry either.
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

  // Two Finnhub calls plus one Polygon call per symbol, so only backfill a
  // couple of stale symbols per request — same throttling reasoning as
  // /api/dividends.
  const BATCH_SIZE = 2;
  for (const dbSym of stale.slice(0, BATCH_SIZE)) {
    const finnhubSym = finnhubByDbSymbol.get(dbSym)!;
    try {
      // Polygon revenue is best-effort but not swallowed silently — a failed
      // call (rate limit is common here, since /api/dividends shares the same
      // key) used to be caught into an empty array indistinguishable from "no
      // revenue data exists," and the whole entry still got cached as
      // checked-today, locking in blank revenue for every quarter until
      // tomorrow. Now a Polygon failure is tracked separately (still run
      // concurrently with the Finnhub calls) so the cache write below can be
      // skipped, leaving the symbol stale for a retry on the next poll.
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
      // No upcoming date and no reported quarters — Finnhub has nothing on
      // this symbol at all, which for a real, currently-listed company
      // basically doesn't happen. In practice this is a manually-entered
      // private/illiquid position (no public listing to report against),
      // same category of noise as a fund. Still cached as checked-today
      // (so it's not retried on every request, burning API calls forever),
      // just never surfaced to the UI.
      const isEmpty = entry.nextDate === null && entry.history.length === 0;
      if (!isEmpty) bySymbol.set(dbSym, entry);
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

  return jsonNoStore({ asOf: today, earnings: Array.from(bySymbol.values()), ...(errors.length ? { errors } : {}) });
}
