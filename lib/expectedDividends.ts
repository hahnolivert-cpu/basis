import { mergeBySym } from "./calc";
import type { Holding } from "./types";

// Projects dividend income forward from *current* holdings rather than
// reading past payment amounts — a symbol's trailing actual dollars reflect
// whatever position size was held back then, not what it'd pay today.
export type ExpectedContribution = { symbol: string; name: string; amountCents: number };
export type MonthlyExpected = { totalCents: number; bySymbol: ExpectedContribution[] };

export type DividendTxnLike = { type: string; symbol: string | null; date: string; amountCents: number };

// A symbol's payment cadence — inferred from the average gap between its own
// historical payment dates, not just which calendar months happen to appear
// — decides how its annual expected income gets timed:
//
// - Monthly-equivalent payers (e.g. STRC, ~30-day gaps) get the annual total
//   split evenly across all 12 months. Going purely off which months are
//   already in the sync history would leave gaps for any month before the
//   position was opened, even though a true monthly payer will pay in every
//   one of them going forward.
// - Everything less frequent (quarterly, semi-annual, or genuinely
//   irregular payers like BIDD, which pays one small and one large
//   distribution a year) gets the annual total split *proportionally* to
//   how history actually divides across months, not evenly — an even split
//   would misrepresent both the low and the high payment.
//
// A symbol with no dividend history at all can't be timed either way, so
// it's left out rather than guessed at.
const MONTHLY_CADENCE_THRESHOLD = 10; // payments/year at or above this count as "monthly"

function inferPaymentsPerYear(datesSorted: string[]): number {
  if (datesSorted.length < 2) return datesSorted.length;
  const days = datesSorted.map((d) => new Date(`${d}T00:00:00Z`).getTime() / 86400000);
  const gaps = days.slice(1).map((d, i) => d - days[i]);
  const avgGap = gaps.reduce((s, g) => s + g, 0) / gaps.length;
  if (avgGap <= 0) return datesSorted.length;
  return Math.round(365 / avgGap);
}

export function projectExpectedDividends(holdings: Holding[], dividendTxns: DividendTxnLike[]): MonthlyExpected[] {
  const eventsBySymbol = new Map<string, { date: string; amountCents: number }[]>();
  for (const t of dividendTxns) {
    if (t.type !== "dividend" || !t.symbol) continue;
    if (!eventsBySymbol.has(t.symbol)) eventsBySymbol.set(t.symbol, []);
    eventsBySymbol.get(t.symbol)!.push({ date: t.date, amountCents: t.amountCents });
  }

  const result: MonthlyExpected[] = Array.from({ length: 12 }, () => ({ totalCents: 0, bySymbol: [] }));

  for (const h of mergeBySym(holdings)) {
    if (h.yld <= 0) continue;
    const events = eventsBySymbol.get(h.sym);
    if (!events || events.length === 0) continue;

    const annualCents = Math.round(((h.value * h.yld) / 100) * 100);
    const uniqueDates = Array.from(new Set(events.map((e) => e.date))).sort();
    const paymentsPerYear = inferPaymentsPerYear(uniqueDates);

    if (paymentsPerYear >= MONTHLY_CADENCE_THRESHOLD) {
      const perMonthCents = Math.round(annualCents / 12);
      for (let m = 0; m < 12; m++) {
        result[m].totalCents += perMonthCents;
        result[m].bySymbol.push({ symbol: h.sym, name: h.name, amountCents: perMonthCents });
      }
      continue;
    }

    const byMonthCents = new Array(12).fill(0) as number[];
    for (const e of events) {
      const idx = Number(e.date.slice(5, 7)) - 1;
      if (idx < 0 || idx > 11) continue;
      byMonthCents[idx] += Math.abs(e.amountCents);
    }
    const historicalTotal = byMonthCents.reduce((s, v) => s + v, 0);
    if (historicalTotal <= 0) continue;
    for (let m = 0; m < 12; m++) {
      if (byMonthCents[m] <= 0) continue;
      const expected = Math.round(annualCents * (byMonthCents[m] / historicalTotal));
      if (expected <= 0) continue;
      result[m].totalCents += expected;
      result[m].bySymbol.push({ symbol: h.sym, name: h.name, amountCents: expected });
    }
  }

  for (const m of result) m.bySymbol.sort((a, b) => b.amountCents - a.amountCents);
  return result;
}
