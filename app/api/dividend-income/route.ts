import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";

// Dividend/interest ledger for the Dividends tab — every payment received,
// plus withholding tax withheld against it, so the tab can show gross vs net
// rather than silently dropping tax as an unlabeled "transfer".
export const dynamic = "force-dynamic";

type IncomeType = "dividend" | "interest" | "withholding_tax";

type IncomeRowDb = {
  id: string;
  date: string;
  type: string;
  symbol: string | null;
  description: string | null;
  amount_cents: number;
  accounts: { institution: string; portfolio: string } | null;
};

export type IncomeTransaction = {
  id: string;
  date: string;
  type: IncomeType;
  symbol: string | null;
  name: string;
  institution: string;
  portfolio: "capital" | "personal";
  amountCents: number;
};

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ transactions: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  try {
    const supabase = createServiceClient();
    const [{ data: rowsRaw, error: rowsErr }, { data: holdingsRaw, error: holdingsErr }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, date, type, symbol, description, amount_cents, accounts(institution, portfolio)")
        .in("type", ["dividend", "interest", "withholding_tax"])
        .order("date", { ascending: false })
        .returns<IncomeRowDb[]>(),
      supabase.from("holdings").select("symbol, name").returns<{ symbol: string; name: string }[]>(),
    ]);
    if (rowsErr) throw new Error(rowsErr.message);
    if (holdingsErr) throw new Error(holdingsErr.message);

    const nameBySymbol = new Map((holdingsRaw ?? []).map((h) => [h.symbol, h.name]));

    // Some Plaid-sourced dividend rows carry no linked security (Robinhood's
    // feed doesn't always attach one), so `symbol` is null there — fall back
    // to the raw description, which already names the source in that case
    // (e.g. "Cash dividend of $105.42 from STRC - DIVIDEND").
    const transactions: IncomeTransaction[] = (rowsRaw ?? []).map((r) => ({
      id: r.id,
      date: r.date,
      type: r.type as IncomeType,
      symbol: r.symbol,
      name: r.symbol ? nameBySymbol.get(r.symbol) ?? r.symbol : r.description ?? "—",
      institution: r.accounts?.institution ?? "Unknown",
      portfolio: r.accounts?.portfolio === "personal" ? "personal" : "capital",
      amountCents: r.amount_cents,
    }));

    return jsonNoStore({ transactions });
  } catch (e) {
    return jsonNoStore({ transactions: [], error: safeMessage(e) }, { status: 500 });
  }
}
