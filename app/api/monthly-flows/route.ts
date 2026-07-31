import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";

// Monthly invested (buy) vs sold (sell) totals for the dashboard's activity
// chart. Aggregated server-side from every buy/sell row — unlike
// /api/transactions, this doesn't require qty/price_cents to be set, since
// only the dollar total per month matters here.
export const dynamic = "force-dynamic";

export type MonthlyFlow = { month: string; invested: number; sold: number };
export type MonthlyFlowsPayload = { months: MonthlyFlow[]; error?: string };

export type FlowTransaction = { id: string; date: string; type: "buy" | "sell"; symbol: string | null; amountCents: number };
export type MonthlyFlowDetailPayload = { transactions: FlowTransaction[]; error?: string };

type FlowRow = { id: string; date: string; type: "buy" | "sell"; symbol: string | null; amount_cents: number };

export async function GET(req: Request) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ months: [], transactions: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  // Clicking a bar in the chart opens a detail view for that month (or, for
  // the seasonal dividend calendar, every year that month occurred in the
  // selected range) — same data source, filtered to those months instead of
  // aggregated.
  const monthsParam = new URL(req.url).searchParams.get("months");

  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("transactions")
      .select("id, date, type, symbol, amount_cents")
      .in("type", ["buy", "sell"])
      .order("date", { ascending: true })
      .returns<FlowRow[]>();
    if (error) throw new Error(error.message);

    if (monthsParam) {
      const wanted = new Set(monthsParam.split(",").filter(Boolean));
      const transactions: FlowTransaction[] = (data ?? [])
        .filter((t) => wanted.has(t.date.slice(0, 7)))
        .map((t) => ({ id: t.id, date: t.date, type: t.type, symbol: t.symbol, amountCents: t.amount_cents }))
        .sort((a, b) => b.date.localeCompare(a.date));
      return jsonNoStore({ transactions });
    }

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
    return jsonNoStore({ months: [], transactions: [], error: safeMessage(e) }, { status: 500 });
  }
}
