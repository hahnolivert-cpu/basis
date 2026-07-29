import { NextResponse, type NextRequest } from "next/server";
import { BASE_HOLDINGS } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";
import { getQuotes } from "@/lib/market";
import { getDbHoldings } from "@/lib/holdings";
import { runAllSyncs } from "@/lib/sync";

// Scheduled by vercel.json for Sundays at 23:00 UTC. Not covered by the auth
// middleware (see middleware.ts) — it authenticates on CRON_SECRET instead.
//
// Everything here runs in-process. An earlier version called /api/quotes and
// /api/sync over HTTP, which always 401'd: those routes sit behind the session
// middleware and a scheduled run carries no cookie, so the snapshot silently
// fell back to stale seed values.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Sunday for a given instant: today if it is Sunday (UTC), else the most
// recent one. The cron fires on Sunday, so this normally returns today.
function currentSunday(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d.toISOString().slice(0, 10);
}

// Symbols are absent from the map whenever an upstream quote fails, so the
// value is deliberately optional — the `?.` guards below are load-bearing.
type QuoteMap = Record<string, { price: number } | undefined>;

// CoinGecko direct as a fallback if the quote batch didn't yield BTC.
async function fetchBtcPrice(): Promise<number | null> {
  const key = process.env.COINGECKO_API_KEY;
  const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd", {
    headers: key ? { "x-cg-demo-api-key": key } : {},
    cache: "no-store",
  });
  const json = await res.json();
  const px = json?.bitcoin?.usd;
  return typeof px === "number" && px > 0 ? px : null;
}

// Finnhub quotes OANDA:EUR_USD as USD per EUR (~1.16). weekly_snapshots stores
// EUR per USD (~0.86) to match the source spreadsheet, so invert it.
async function fetchUsdToEur(): Promise<number | null> {
  const key = process.env.FINNHUB_API_KEY;
  if (!key) return null;
  const res = await fetch(`https://finnhub.io/api/v1/quote?symbol=OANDA:EUR_USD&token=${key}`, { cache: "no-store" });
  const json = await res.json();
  const eurusd = json?.c;
  return typeof eurusd === "number" && eurusd > 0 ? 1 / eurusd : null;
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed rather than leave a public write endpoint exposed.
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  const warnings: string[] = [];

  // Step 1: refresh live prices, then reprice qty-based holdings the same way
  // the dashboard does. Cash stays at its recorded balance.

  // Provider syncs first, so the week is snapshotted against freshly pulled
  // positions. A sync failure is recorded but doesn't abort the snapshot.
  try {
    const sync = await runAllSyncs();
    if (sync.failed > 0) {
      const failures = sync.results.filter((r) => !r.ok).map((r) => `${r.target}: ${r.error}`);
      warnings.push(`${sync.failed} provider sync(s) failed — ${failures.join("; ")}`);
    }
  } catch (e) {
    warnings.push(`provider sync failed — ${e instanceof Error ? e.message : String(e)}`);
  }

  let quotes: QuoteMap = {};
  try {
    quotes = (await getQuotes({ force: true })).quotes ?? {};
  } catch (e) {
    warnings.push(`quote refresh failed, using snapshot values — ${e instanceof Error ? e.message : String(e)}`);
  }

  // Bucket the real synced holdings; the seed is only a pre-first-sync fallback.
  let source: { sym: string; cls: string; qty?: number; value: number }[] = BASE_HOLDINGS;
  try {
    const db = await getDbHoldings();
    if (db.length) source = db;
    else warnings.push("no holdings in database, bucketed the static seed");
  } catch (e) {
    warnings.push(`holdings lookup failed, bucketed the static seed — ${e instanceof Error ? e.message : String(e)}`);
  }

  const priced = source.map((h) => {
    const qty = h.qty;
    const px = qty ? quotes[h.sym]?.price : undefined;
    return { cls: h.cls, value: px && qty ? qty * px : h.value };
  });

  const bucket = (cls: string) =>
    Math.round(priced.filter((h) => h.cls === cls).reduce((s, h) => s + h.value, 0) * 100);

  const crypto_cents = bucket("Crypto");
  const equities_cents = bucket("Equities");
  const cash_cents = bucket("Cash");
  const total_cents = crypto_cents + equities_cents + cash_cents;

  // Step 2: the day's rates. Fall back to the previous row's values rather
  // than writing a zero that would corrupt the EUR/BTC series.
  const supabase = createServiceClient();
  const { data: prevRows } = await supabase
    .from("weekly_snapshots")
    .select("usd_to_eur, btc_price_usd")
    .order("sunday_date", { ascending: false })
    .limit(1);
  const prev = prevRows?.[0];

  let usd_to_eur = await fetchUsdToEur();
  if (usd_to_eur === null) {
    usd_to_eur = prev ? Number(prev.usd_to_eur) : null;
    warnings.push("EURUSD unavailable, carried forward previous rate");
  }

  let btc_price_usd = quotes.BTC?.price ?? (await fetchBtcPrice());
  if (btc_price_usd === null || btc_price_usd === undefined) {
    btc_price_usd = prev ? Number(prev.btc_price_usd) : null;
    warnings.push("BTC price unavailable, carried forward previous price");
  }

  if (usd_to_eur === null || btc_price_usd === null) {
    return NextResponse.json(
      { error: "No FX/BTC rate available and no previous row to carry forward", warnings },
      { status: 502 }
    );
  }

  // Step 3: upsert this week's row. Keyed on sunday_date, so a retry or a
  // manual re-run refreshes the week rather than duplicating it.
  const sunday_date = currentSunday();
  const { error } = await supabase.from("weekly_snapshots").upsert(
    { sunday_date, crypto_cents, equities_cents, cash_cents, total_cents, usd_to_eur, btc_price_usd, source: "auto" },
    { onConflict: "sunday_date" }
  );

  if (error) {
    return NextResponse.json({ error: error.message, warnings }, { status: 500 });
  }

  return NextResponse.json({
    sunday_date,
    crypto_cents,
    equities_cents,
    cash_cents,
    total_cents,
    usd_to_eur,
    btc_price_usd,
    source: "auto",
    ...(warnings.length ? { warnings } : {}),
  });
}
