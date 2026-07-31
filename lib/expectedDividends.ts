import { mergeBySym } from "./calc";
import type { Holding } from "./types";

// Projects dividend income forward from *current* holdings rather than
// reading past payment amounts — a symbol's trailing actual dollars reflect
// whatever position size was held back then, not what it'd pay today.
//
// Each held symbol's annual expected income (value × trailing yield) is
// split evenly across whichever calendar months it has actually paid a
// dividend in before — inferred from history since neither IBKR, Plaid, nor
// the Polygon yield lookup expose a forward payment schedule. A symbol with
// no dividend history at all can't be timed, so it's left out rather than
// guessed at.
export type ExpectedContribution = { symbol: string; name: string; amountCents: number };
export type MonthlyExpected = { totalCents: number; bySymbol: ExpectedContribution[] };

export type DividendTxnLike = { type: string; symbol: string | null; date: string };

export function projectExpectedDividends(holdings: Holding[], dividendTxns: DividendTxnLike[]): MonthlyExpected[] {
  const paymentMonths = new Map<string, Set<number>>();
  for (const t of dividendTxns) {
    if (t.type !== "dividend" || !t.symbol) continue;
    const idx = Number(t.date.slice(5, 7)) - 1;
    if (idx < 0 || idx > 11) continue;
    if (!paymentMonths.has(t.symbol)) paymentMonths.set(t.symbol, new Set());
    paymentMonths.get(t.symbol)!.add(idx);
  }

  const result: MonthlyExpected[] = Array.from({ length: 12 }, () => ({ totalCents: 0, bySymbol: [] }));

  for (const h of mergeBySym(holdings)) {
    if (h.yld <= 0) continue;
    const months = paymentMonths.get(h.sym);
    if (!months || months.size === 0) continue;
    const annualCents = Math.round(((h.value * h.yld) / 100) * 100);
    const perPaymentCents = Math.round(annualCents / months.size);
    for (const idx of Array.from(months)) {
      result[idx].totalCents += perPaymentCents;
      result[idx].bySymbol.push({ symbol: h.sym, name: h.name, amountCents: perPaymentCents });
    }
  }

  for (const m of result) m.bySymbol.sort((a, b) => b.amountCents - a.amountCents);
  return result;
}
