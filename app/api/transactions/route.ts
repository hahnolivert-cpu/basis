import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";
import { CRYPTO_BASES, looksLikeFund } from "@/lib/holdings";

// Buy-transaction history for the Holdings tab's Transactions section. Only
// rows with qty/price recorded (i.e. synced after the qty/price_cents
// migration) are useful here — a purchase without a per-unit price can't
// show "bought N @ $P", so those are left out rather than shown blank.
export const dynamic = "force-dynamic";

type BuyRow = {
  id: string;
  date: string;
  symbol: string | null;
  amount_cents: number;
  qty: number | null;
  price_cents: number | null;
  accounts: { institution: string; portfolio: string } | null;
};
type HoldingRow = { symbol: string; name: string; asset_class: string };

export type TransactionRow = {
  id: string;
  date: string;
  symbol: string;
  name: string;
  assetClass: string;
  isEtf: boolean;
  institution: string;
  portfolio: "capital" | "personal";
  qty: number;
  priceCents: number;
  totalCents: number;
  isRecurring: boolean;
};

function classify(symbol: string, byHolding: Map<string, HoldingRow>): { name: string; assetClass: string; isEtf: boolean } {
  const known = byHolding.get(symbol);
  if (known) return { name: known.name, assetClass: known.asset_class, isEtf: looksLikeFund(symbol, known.name) };
  const base = symbol.split(/[.\-/]/)[0].trim().toUpperCase();
  return { name: symbol, assetClass: base in CRYPTO_BASES ? "Crypto" : "Equities", isEtf: looksLikeFund(symbol, symbol) };
}

// A symbol reads as "recurring" when it has at least 3 buys landing at a
// roughly constant cadence (weekly to monthly) — a low coefficient of
// variation on the gaps between purchases. Neither IBKR nor Plaid expose an
// actual recurring-order schedule, so this is inferred from the pattern of
// past buys, not read from account settings.
function isRegularCadence(datesSorted: string[]): boolean {
  if (datesSorted.length < 3) return false;
  const days = datesSorted.map((d) => new Date(`${d}T00:00:00Z`).getTime() / 86400000);
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const mean = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (mean < 4 || mean > 45) return false;
  const variance = gaps.reduce((s, g) => s + (g - mean) ** 2, 0) / gaps.length;
  const cv = Math.sqrt(variance) / mean;
  return cv < 0.4;
}

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ transactions: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  try {
    const supabase = createServiceClient();
    const [{ data: buysRaw, error: buysErr }, { data: holdingsRaw, error: holdingsErr }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, date, symbol, amount_cents, qty, price_cents, accounts(institution, portfolio)")
        .eq("type", "buy")
        .not("qty", "is", null)
        .not("price_cents", "is", null)
        .order("date", { ascending: false })
        .returns<BuyRow[]>(),
      supabase.from("holdings").select("symbol, name, asset_class").returns<HoldingRow[]>(),
    ]);
    if (buysErr) throw new Error(buysErr.message);
    if (holdingsErr) throw new Error(holdingsErr.message);

    const buys = (buysRaw ?? []).filter((b): b is BuyRow & { symbol: string; qty: number; price_cents: number } => Boolean(b.symbol && b.qty && b.price_cents));
    const byHolding = new Map((holdingsRaw ?? []).map((h) => [h.symbol, h]));

    const bySymbolDates = new Map<string, string[]>();
    for (const b of buys) {
      const arr = bySymbolDates.get(b.symbol) ?? [];
      arr.push(b.date);
      bySymbolDates.set(b.symbol, arr);
    }
    const recurringSymbols = new Set<string>();
    Array.from(bySymbolDates.entries()).forEach(([symbol, dates]) => {
      if (isRegularCadence([...dates].sort())) recurringSymbols.add(symbol);
    });

    const transactions: TransactionRow[] = buys.map((b) => {
      const { name, assetClass, isEtf } = classify(b.symbol, byHolding);
      return {
        id: b.id,
        date: b.date,
        symbol: b.symbol,
        name,
        assetClass,
        isEtf,
        institution: b.accounts?.institution ?? "Unknown",
        portfolio: b.accounts?.portfolio === "personal" ? "personal" : "capital",
        qty: b.qty,
        priceCents: b.price_cents,
        totalCents: Math.abs(b.amount_cents),
        isRecurring: recurringSymbols.has(b.symbol),
      };
    });

    return jsonNoStore({ transactions });
  } catch (e) {
    return jsonNoStore({ transactions: [], error: safeMessage(e) }, { status: 500 });
  }
}
