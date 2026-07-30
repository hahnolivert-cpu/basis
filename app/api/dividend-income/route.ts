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
  // Always a ticker where one is determinable, so the Source column reads
  // consistently instead of switching between a ticker and a full sentence
  // depending on which provider synced the row.
  source: string;
  name: string;
  institution: string;
  portfolio: "capital" | "personal";
  amountCents: number;
};

// Plaid's Robinhood dividend feed doesn't always attach a security_id, so
// `symbol` on those rows is null — but the description still names the
// ticker (e.g. "Cash dividend of $105.42 from STRC - DIVIDEND"), so it can
// be recovered from there instead of falling back to the raw sentence.
function extractTicker(description: string | null): string | null {
  if (!description) return null;
  return description.match(/from ([A-Z][A-Z0-9.]{0,9}) -/)?.[1] ?? null;
}

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

    const transactions: IncomeTransaction[] = (rowsRaw ?? []).map((r) => {
      const institution = r.accounts?.institution ?? "Unknown";
      const ticker = r.symbol ?? extractTicker(r.description);
      // Bank/broker interest isn't tied to a holding at all — there's no
      // ticker to recover, so the institution is the most useful label.
      const source = ticker ?? institution;
      return {
        id: r.id,
        date: r.date,
        type: r.type as IncomeType,
        symbol: r.symbol,
        source,
        name: ticker ? nameBySymbol.get(ticker) ?? ticker : institution,
        institution,
        portfolio: r.accounts?.portfolio === "personal" ? "personal" : "capital",
        amountCents: r.amount_cents,
      };
    });

    return jsonNoStore({ transactions });
  } catch (e) {
    return jsonNoStore({ transactions: [], error: safeMessage(e) }, { status: 500 });
  }
}
