import { jsonNoStore, safeMessage } from "@/lib/http";
import { BASE_HOLDINGS } from "@/lib/data";
import { getDbHoldings, quoteRefFor } from "@/lib/holdings";
import { createServiceClient } from "@/lib/supabase/service";

// Next earnings date + analyst estimates, and actual-vs-estimate results for
// the last several quarters, for whichever equities are actually held.
// Finnhub's free tier has no earnings-call transcript access — this is the
// reported numbers (EPS/revenue actual vs estimate, surprise %), not a
// transcript of what was said on the call.
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
  const next = (json.earningsCalendar ?? [])[0];
  if (!next) return null;
  return { date: next.date, epsEstimate: next.epsEstimate ?? null, revenueEstimate: next.revenueEstimate ?? null };
}

async function fetchEarningsHistory(symbol: string, apiKey: string): Promise<EarningsQuarter[]> {
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

export async function GET() {
  const apiKey = process.env.FINNHUB_API_KEY;
  const today = new Date().toISOString().slice(0, 10);

  let equities: { sym: string; cls: string }[];
  try {
    const db = await getDbHoldings();
    equities = db.length ? db : BASE_HOLDINGS;
  } catch {
    equities = BASE_HOLDINGS;
  }
  // Cache and output are keyed on the original holdings symbol (e.g. "BRK B"),
  // not the Finnhub dialect ("BRK.B") — otherwise a share-class ticker with a
  // space caches under a key nothing else in the app recognises, and the
  // component's holdings-name lookup (keyed on the DB symbol) silently misses.
  const finnhubByDbSymbol = new Map<string, string>();
  for (const h of equities) {
    if (h.cls !== "Equities") continue;
    const ref = quoteRefFor(h.sym, h.cls);
    if (ref?.type === "equity") finnhubByDbSymbol.set(h.sym, ref.symbol);
  }
  const dbSymbols = Array.from(finnhubByDbSymbol.keys());

  const errors: string[] = [];
  if (!apiKey) {
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

  // Two Finnhub calls per symbol, so only backfill a couple of stale symbols
  // per request — same throttling reasoning as /api/dividends.
  const BATCH_SIZE = 2;
  for (const dbSym of stale.slice(0, BATCH_SIZE)) {
    const finnhubSym = finnhubByDbSymbol.get(dbSym)!;
    try {
      const [next, history] = await Promise.all([fetchEarningsCalendar(finnhubSym, apiKey), fetchEarningsHistory(finnhubSym, apiKey)]);
      const entry: SymbolEarnings = {
        symbol: dbSym,
        nextDate: next?.date ?? null,
        nextEpsEstimate: next?.epsEstimate ?? null,
        nextRevenueEstimate: next?.revenueEstimate ?? null,
        history,
      };
      bySymbol.set(dbSym, entry);
      if (supabase) {
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
