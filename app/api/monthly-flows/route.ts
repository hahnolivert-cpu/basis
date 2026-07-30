import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";

// Monthly invested (buy) vs sold (sell) totals for the main dashboard's
// activity chart. Aggregated server-side from every buy/sell row — unlike
// /api/transactions, this doesn't require qty/price_cents to be set, since
// only the dollar total per month matters here.
export const dynamic = "force-dynamic";

export type MonthlyFlow = { month: string; invested: number; sold: number };
export type MonthlyFlowsPayload = { months: MonthlyFlow[]; error?: string };

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ months: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("date, type, amount_cents")
      .in("type", ["buy", "sell"])
      .order("date", { ascending: true })
      .returns<{ date: string; type: "buy" | "sell"; amount_cents: number }[]>();
    if (error) throw new Error(error.message);

    const byMonth = new Map<string, MonthlyFlow>();
    for (const t of data ?? []) {
      const month = t.date.slice(0, 7);
      const row = byMonth.get(month) ?? { month, invested: 0, sold: 0 };
      if (t.type === "buy") row.invested += Math.abs(t.amount_cents);
      else row.sold += Math.abs(t.amount_cents);
      byMonth.set(month, row);
    }

    return jsonNoStore({ months: Array.from(byMonth.values()).sort((a, b) => a.month.localeCompare(b.month)) });
  } catch (e) {
    return jsonNoStore({ months: [], error: safeMessage(e) }, { status: 500 });
  }
}
