import { NextResponse, type NextRequest } from "next/server";
import { BASE_HOLDINGS } from "@/lib/data";
import { createServiceClient } from "@/lib/supabase/service";

// Scheduled by vercel.json for Sundays at 23:00 UTC. Not covered by the auth
// middleware (see middleware.ts) — it authenticates on CRON_SECRET instead.
export const dynamic = "force-dynamic";

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

async function fetchQuotes(origin: string, cookie: string | null) {
  const res = await fetch(`${origin}/api/quotes`, {
    headers: cookie ? { cookie } : {},
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`/api/quotes returned ${res.status}`);
  return (await res.json()) as { quotes: QuoteMap; eurusd: number | null };
}

// CoinGecko direct (rather than via /api/quotes) so the cron gets a BTC price
// even when the internal call is unavailable.
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
  let quotes: QuoteMap = {};
  try {
    const q = await fetchQuotes(request.nextUrl.origin, request.headers.get("cookie"));
    quotes = q.quotes ?? {};
  } catch (e) {
    warnings.push(`quote sync failed, using snapshot values — ${e instanceof Error ? e.message : String(e)}`);
  }

  const priced = BASE_HOLDINGS.map((h) => {
    const px = h.qty ? quotes[h.sym]?.price : undefined;
    return { cls: h.cls, value: px ? h.qty! * px : h.value };
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
