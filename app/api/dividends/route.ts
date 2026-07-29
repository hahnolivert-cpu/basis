import { jsonNoStore } from "@/lib/http";
import { BASE_HOLDINGS } from "@/lib/data";
import { getDbHoldings, quoteRefFor } from "@/lib/holdings";
import { createServiceClient } from "@/lib/supabase/service";

// Cache logic below depends on running per-request, not a build-time snapshot.
export const dynamic = "force-dynamic";

type DividendCacheRow = { symbol: string; yield_pct: number; updated_at: string };
export type DividendsPayload = { asOf: string; yields: Record<string, number>; errors?: string[] };

// Trailing-12-month dividends per share (from Polygon's dividends
// reference) divided by the previous close, as a % yield estimate.
async function fetchPolygonYield(symbol: string, apiKey: string): Promise<number | null> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const cutoff = oneYearAgo.toISOString().slice(0, 10);

  const divRes = await fetch(
    `https://api.polygon.io/v3/reference/dividends?ticker=${symbol}&ex_dividend_date.gte=${cutoff}&limit=50&apiKey=${apiKey}`,
    { cache: "no-store" }
  );
  const divJson = await divRes.json();
  // Polygon returns 200 with a body like {"status":"ERROR","error":"..."}
  // when rate-limited — an empty `results` here isn't necessarily "no
  // dividends", so treat anything other than a clean OK as a failure rather
  // than silently caching a false zero.
  if (!divRes.ok || divJson.status !== "OK") {
    throw new Error(divJson.error || `Polygon dividends request failed (${divRes.status})`);
  }
  const perShare: number = (divJson.results ?? []).reduce(
    (s: number, d: { cash_amount?: number }) => s + (d.cash_amount ?? 0),
    0
  );
  if (perShare <= 0) return 0;

  const priceRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`, {
    cache: "no-store",
  });
  const priceJson = await priceRes.json();
  if (!priceRes.ok || priceJson.status !== "OK") {
    throw new Error(priceJson.error || `Polygon prev-close request failed (${priceRes.status})`);
  }
  const price = priceJson.results?.[0]?.c;
  if (!price) return null;

  return +((perShare / price) * 100).toFixed(2);
}

export async function GET() {
  const apiKey = process.env.POLYGON_API_KEY;
  const today = new Date().toISOString().slice(0, 10);
  // Yields for whatever equities are actually held, normalised to the ticker
  // Polygon expects (IBKR writes share classes with a space, e.g. "BRK B").
  let equities: { sym: string; cls: string }[];
  try {
    const db = await getDbHoldings();
    equities = db.length ? db : BASE_HOLDINGS;
  } catch {
    equities = BASE_HOLDINGS;
  }
  const symbols = Array.from(
    new Set(
      equities
        .filter((h) => h.cls === "Equities")
        .map((h) => {
          const ref = quoteRefFor(h.sym, h.cls);
          return ref?.type === "equity" ? ref.symbol : null;
        })
        .filter((s): s is string => s !== null)
    )
  );
  const yields: Record<string, number> = {};
  const errors: string[] = [];

  if (!apiKey) {
    return jsonNoStore({ asOf: today, yields, errors: ["POLYGON_API_KEY not set"] });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = serviceKey ? createServiceClient() : null;
  if (!serviceKey) errors.push("SUPABASE_SERVICE_ROLE_KEY not set — skipping cache");

  let stale = symbols;
  if (supabase) {
    const { data: cached } = await supabase
      .from("dividend_cache")
      .select("symbol, yield_pct, updated_at")
      .in("symbol", symbols)
      .returns<DividendCacheRow[]>();
    for (const row of cached ?? []) {
      if (row.updated_at === today) yields[row.symbol] = row.yield_pct;
    }
    stale = symbols.filter((s) => !(s in yields));
  }

  // Polygon's free tier caps out around 5 requests/minute and this needs 2
  // calls per symbol, so a request only backfills a few stale symbols at a
  // time (sequentially, not Promise.all) rather than bursting all of them —
  // the rest just fall back to the static value and pick up on a later poll.
  const POLYGON_BATCH_SIZE = 2;
  for (const sym of stale.slice(0, POLYGON_BATCH_SIZE)) {
    try {
      const y = await fetchPolygonYield(sym, apiKey);
      if (y === null) {
        errors.push(`Polygon: no price for ${sym}`);
        continue;
      }
      yields[sym] = y;
      if (supabase) await supabase.from("dividend_cache").upsert({ symbol: sym, yield_pct: y, updated_at: today });
    } catch (e) {
      errors.push(`Polygon: ${sym} request failed — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  return jsonNoStore({ asOf: today, yields, ...(errors.length ? { errors } : {}) });
}
