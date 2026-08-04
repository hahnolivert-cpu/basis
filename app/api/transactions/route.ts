import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";
import { CRYPTO_BASES, looksLikeFund } from "@/lib/holdings";

// Buy/sell transaction history for the Holdings tab's Transactions section.
// Only rows with qty/price recorded (i.e. synced after the qty/price_cents
// migration) are useful here — a trade without a per-unit price can't show
// "bought N @ $P", so those are left out rather than shown blank.
export const dynamic = "force-dynamic";

type TradeRow = {
  id: string;
  account_id: string;
  date: string;
  type: "buy" | "sell";
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
  type: "buy" | "sell";
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
  // Only set for sells — see realizedGains(). Null means there wasn't enough
  // tracked buy history to know this sale's cost basis, not that the gain is
  // zero.
  realizedGainCents: number | null;
};

function classify(symbol: string, byHolding: Map<string, HoldingRow>): { name: string; assetClass: string; isEtf: boolean } {
  const known = byHolding.get(symbol);
  if (known) return { name: known.name, assetClass: known.asset_class, isEtf: looksLikeFund(symbol, known.name) };
  const base = symbol.split(/[.\-/]/)[0].trim().toUpperCase();
  return { name: symbol, assetClass: base in CRYPTO_BASES ? "Crypto" : "Equities", isEtf: looksLikeFund(symbol, symbol) };
}

type PricedTrade = TradeRow & { symbol: string; qty: number; price_cents: number };

// Realized gain/loss per sell, by average cost basis — this app doesn't track
// individual lots (no per-purchase lot IDs from any provider), so it can't do
// real FIFO/specific-lot accounting. Instead, each (account, symbol)'s trades
// are walked oldest-first, keeping a running (qty, total cost); a sell's gain
// is its proceeds minus qty × that running average cost per share, and the
// position's cost shrinks proportionally afterward. Scoped per *account*, not
// just symbol — several symbols (V, MSFT, GOOGL, MSTR, BMNR, ...) are held in
// both 976 Capital and Personal, and pooling their buys/sells together would
// let a sell in one portfolio consume cost basis from a buy in the other,
// silently misattributing gains/losses between them (confirmed: one MSTR
// sell read as a +$1,433.81 gain pooled, vs. its real -$165.00 loss once
// scoped to its own account). A sell for more than the tracked qty (its cost
// basis predates this symbol's synced history in this account, or the
// 730-day transaction lookback) has no reliable basis to compare against, so
// it — and the untracked position after it — reports null rather than a
// number that quietly assumes a $0 cost basis.
// IBKR logs currency conversions (EUR.USD, USD.CHF, ...) as ordinary
// buy/sell transactions too, with `price_cents` holding an FX rate rather
// than a per-share price — averaging that in as if it were a security would
// produce a meaningless "gain" on the conversion itself. Recognized by
// shape (three letters, a dot, three letters) rather than a hardcoded list,
// so a new currency pair doesn't silently slip through uncaught.
const CURRENCY_PAIR = /^[A-Z]{3}\.[A-Z]{3}$/;

function realizedGains(trades: PricedTrade[]): Map<string, number | null> {
  const byAccountSymbol = new Map<string, PricedTrade[]>();
  for (const t of trades) {
    if (CURRENCY_PAIR.test(t.symbol)) continue;
    const key = `${t.account_id}::${t.symbol}`;
    const arr = byAccountSymbol.get(key) ?? [];
    arr.push(t);
    byAccountSymbol.set(key, arr);
  }

  const result = new Map<string, number | null>();
  for (const symTrades of Array.from(byAccountSymbol.values())) {
    const ordered = [...symTrades].sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      // Same-day ties: buys before sells, so a same-day round trip still has
      // a cost basis to sell against — the DB only carries date, not time.
      if (a.type !== b.type) return a.type === "buy" ? -1 : 1;
      return 0;
    });

    let qty = 0;
    let costCents = 0;
    for (const t of ordered) {
      if (t.type === "buy") {
        qty += t.qty;
        costCents += t.qty * t.price_cents;
        continue;
      }
      if (qty <= 1e-9 || qty + 1e-6 < t.qty) {
        result.set(t.id, null);
        qty = 0;
        costCents = 0;
        continue;
      }
      const costOfSold = (costCents / qty) * t.qty;
      result.set(t.id, Math.round(t.qty * t.price_cents - costOfSold));
      costCents -= costOfSold;
      qty -= t.qty;
    }
  }
  return result;
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
    const [{ data: tradesRaw, error: tradesErr }, { data: holdingsRaw, error: holdingsErr }] = await Promise.all([
      supabase
        .from("transactions")
        .select("id, account_id, date, type, symbol, amount_cents, qty, price_cents, accounts(institution, portfolio)")
        .in("type", ["buy", "sell"])
        .not("qty", "is", null)
        .not("price_cents", "is", null)
        .order("date", { ascending: false })
        .returns<TradeRow[]>(),
      supabase.from("holdings").select("symbol, name, asset_class").returns<HoldingRow[]>(),
    ]);
    if (tradesErr) throw new Error(tradesErr.message);
    if (holdingsErr) throw new Error(holdingsErr.message);

    const trades = (tradesRaw ?? []).filter((t): t is PricedTrade => Boolean(t.symbol && t.qty && t.price_cents));
    const byHolding = new Map((holdingsRaw ?? []).map((h) => [h.symbol, h]));
    const gains = realizedGains(trades);

    // Recurring-cadence detection only looks at buys — a recurring sell
    // schedule isn't a thing Plaid/IBKR expose or this app tracks, and mixing
    // sell dates into the buy cadence would just add noise to the gaps.
    const bySymbolDates = new Map<string, string[]>();
    for (const t of trades) {
      if (t.type !== "buy") continue;
      const arr = bySymbolDates.get(t.symbol) ?? [];
      arr.push(t.date);
      bySymbolDates.set(t.symbol, arr);
    }
    const recurringSymbols = new Set<string>();
    Array.from(bySymbolDates.entries()).forEach(([symbol, dates]) => {
      if (isRegularCadence([...dates].sort())) recurringSymbols.add(symbol);
    });

    const transactions: TransactionRow[] = trades.map((t) => {
      const { name, assetClass, isEtf } = classify(t.symbol, byHolding);
      return {
        id: t.id,
        date: t.date,
        type: t.type,
        symbol: t.symbol,
        name,
        assetClass,
        isEtf,
        institution: t.accounts?.institution ?? "Unknown",
        portfolio: t.accounts?.portfolio === "personal" ? "personal" : "capital",
        qty: t.qty,
        priceCents: t.price_cents,
        totalCents: Math.abs(t.amount_cents),
        isRecurring: recurringSymbols.has(t.symbol),
        realizedGainCents: t.type === "sell" ? gains.get(t.id) ?? null : null,
      };
    });

    return jsonNoStore({ transactions });
  } catch (e) {
    return jsonNoStore({ transactions: [], error: safeMessage(e) }, { status: 500 });
  }
}
