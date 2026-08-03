import { jsonNoStore, safeMessage } from "@/lib/http";
import { BASE_HOLDINGS } from "@/lib/data";
import { getDbHoldings, quoteRefFor } from "@/lib/holdings";
import { createServiceClient } from "@/lib/supabase/service";

// Cache logic below depends on running per-request, not a build-time snapshot.
export const dynamic = "force-dynamic";

type DividendCacheRow = { symbol: string; yield_pct: number; updated_at: string };
export type DividendsPayload = { asOf: string; yields: Record<string, number>; errors?: string[] };

type PolygonDividendRecord = { cash_amount: number; ex_dividend_date: string; frequency: number };

// Trailing 12 months of individual payment records — not just their sum.
// The expected-dividend calendar needs the real ex-dividend date and
// per-share amount of each payment (STRC's floating monthly rate, BIDD's
// wildly uneven quarterly amounts) to time and size months correctly; our
// own sync history is too short and too sparse for that on its own.
async function fetchPolygonDividends(symbol: string, apiKey: string): Promise<PolygonDividendRecord[]> {
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
  return (divJson.results ?? []).map((d: { cash_amount?: number; ex_dividend_date?: string; frequency?: number }) => ({
    cash_amount: d.cash_amount ?? 0,
    ex_dividend_date: d.ex_dividend_date ?? "",
    frequency: d.frequency ?? 0,
  }));
}

async function fetchPrevClose(symbol: string, apiKey: string): Promise<number | null> {
  const priceRes = await fetch(`https://api.polygon.io/v2/aggs/ticker/${symbol}/prev?adjusted=true&apiKey=${apiKey}`, {
    cache: "no-store",
  });
  const priceJson = await priceRes.json();
  if (!priceRes.ok || priceJson.status !== "OK") {
    throw new Error(priceJson.error || `Polygon prev-close request failed (${priceRes.status})`);
  }
  return priceJson.results?.[0]?.c ?? null;
}

export async function GET() {
  const apiKey = process.env.POLYGON_API_KEY;
  const today = new Date().toISOString().slice(0, 10);
  // Yields for whatever equities are actually held.
  let equities: { sym: string; cls: string }[];
  try {
    const db = await getDbHoldings();
    equities = db.length ? db : BASE_HOLDINGS;
  } catch {
    equities = BASE_HOLDINGS;
  }
  // Cache and output are keyed on the original holdings symbol (e.g. "BRK B"),
  // not the Polygon dialect ("BRK.B") — otherwise a share-class ticker with a
  // space caches under a key nothing else in the app recognises. See the same
  // fix in app/api/earnings/route.ts.
  const polygonByDbSymbol = new Map<string, string>();
  for (const h of equities) {
    if (h.cls !== "Equities") continue;
    const ref = quoteRefFor(h.sym, h.cls);
    if (ref?.type === "equity") polygonByDbSymbol.set(h.sym, ref.symbol);
  }
  const symbols = Array.from(polygonByDbSymbol.keys());
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
  // Rotate the starting point by the current minute rather than always
  // slicing from the front: a symbol that keeps failing (rate limit, no
  // Polygon coverage) would otherwise permanently occupy the front of the
  // queue and starve every symbol behind it of a turn.
  const POLYGON_BATCH_SIZE = 2;
  const offset = stale.length ? Math.floor(Date.now() / 60_000) % stale.length : 0;
  const batch = [...stale.slice(offset), ...stale.slice(0, offset)].slice(0, POLYGON_BATCH_SIZE);
  for (const dbSym of batch) {
    const sym = polygonByDbSymbol.get(dbSym)!;
    try {
      const records = await fetchPolygonDividends(sym, apiKey);
      if (supabase && records.length) {
        await supabase
          .from("dividend_schedule_cache")
          .upsert(
            records
              .filter((r) => r.ex_dividend_date)
              .map((r) => ({ symbol: dbSym, ex_dividend_date: r.ex_dividend_date, cash_amount: r.cash_amount, frequency: r.frequency, updated_at: today })),
            { onConflict: "symbol,ex_dividend_date" }
          );
      }

      // Polygon includes dividends that have been declared but haven't gone
      // ex yet — great for the expected-dividend calendar (cached above from
      // the unfiltered `records`), but counting one here overstates trailing
      // yield by a quarter that hasn't actually been paid.
      const perShare = records
        .filter((r) => r.ex_dividend_date && r.ex_dividend_date <= today)
        .reduce((s, r) => s + r.cash_amount, 0);
      if (perShare <= 0) {
        yields[dbSym] = 0;
        if (supabase) await supabase.from("dividend_cache").upsert({ symbol: dbSym, yield_pct: 0, updated_at: today });
        continue;
      }
      const price = await fetchPrevClose(sym, apiKey);
      if (!price) {
        errors.push(`Polygon: no price for ${sym}`);
        continue;
      }
      const y = +((perShare / price) * 100).toFixed(2);
      yields[dbSym] = y;
      if (supabase) await supabase.from("dividend_cache").upsert({ symbol: dbSym, yield_pct: y, updated_at: today });
    } catch (e) {
      errors.push(`Polygon: ${sym} request failed — ${safeMessage(e)}`);
    }
  }

  return jsonNoStore({ asOf: today, yields, ...(errors.length ? { errors } : {}) });
}
