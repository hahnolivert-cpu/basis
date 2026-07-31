import { jsonNoStore, safeMessage } from "@/lib/http";
import { BASE_HOLDINGS } from "@/lib/data";
import { getDbHoldings, quoteRefFor } from "@/lib/holdings";
import { createServiceClient } from "@/lib/supabase/service";

// Serves the dividend_schedule_cache table /api/dividends populates — real
// ex-dividend dates and per-share amounts from Polygon, for whichever
// equities are actually held. Read-only and cheap: no live Polygon calls
// here, just whatever's already cached.
export const dynamic = "force-dynamic";

export type DividendScheduleEntry = { symbol: string; exDividendDate: string; cashAmount: number; frequency: number };
export type DividendSchedulePayload = { schedule: DividendScheduleEntry[]; error?: string };

type ScheduleRow = { symbol: string; ex_dividend_date: string; cash_amount: number; frequency: number | null };

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ schedule: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  try {
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
    if (symbols.length === 0) return jsonNoStore({ schedule: [] });

    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("dividend_schedule_cache")
      .select("symbol, ex_dividend_date, cash_amount, frequency")
      .in("symbol", symbols)
      .returns<ScheduleRow[]>();
    if (error) throw new Error(error.message);

    const schedule: DividendScheduleEntry[] = (data ?? []).map((r) => ({
      symbol: r.symbol,
      exDividendDate: r.ex_dividend_date,
      cashAmount: r.cash_amount,
      frequency: r.frequency ?? 0,
    }));
    return jsonNoStore({ schedule });
  } catch (e) {
    return jsonNoStore({ schedule: [], error: safeMessage(e) }, { status: 500 });
  }
}
