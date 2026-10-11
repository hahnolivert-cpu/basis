// German-style annuity mortgage (Annuitätendarlehen) with Sondertilgungen.
//
// The monthly payment is fixed at the start: loan × (interest + initial
// repayment rate) / 12. Interest is charged on the outstanding balance each
// month, so the share going to principal grows over time. A Sondertilgung
// (special repayment) is an extra lump sum on top that reduces the balance
// immediately; the monthly payment stays the same, so the loan simply ends
// sooner — which is how German lenders treat it by default.
//
// Simplifications, all on the conservative side:
//  - The rate stays the same after the Zinsbindung (fixed-rate period) ends.
//    Real life requires a Anschlussfinanzierung at whatever the market rate is
//    then; the balance at the end of the fixed period is reported separately
//    so that refinancing risk is visible.
//  - Sondertilgung limits are enforced per calendar year, as a percentage of
//    the original loan amount (the usual 5% or 10% clause).

export type OneOffRepayment = { id: string; label: string; amount: number; year: number; month: number };

export type MortgageInputs = {
  price: number;
  // The loan is an input, not derived: with a bank offer in hand the loan is
  // the known number and the cash you need to bring is what falls out of it.
  loan: number;
  // Kaufnebenkosten, each a % of the purchase price.
  taxPct: number; // Grunderwerbsteuer — 3.5–6.5% depending on the state
  notaryPct: number; // Notar & Grundbuch — roughly 1.5–2%
  agentPct: number; // Makler — 0 if bought without one
  ratePct: number; // Sollzins p.a.
  repayPct: number; // anfängliche Tilgung p.a., % of the original loan
  fixedEnd: string; // "YYYY-MM" the Zinsbindung ends; the Restschuld is the balance after that month's payment
  start: string; // "YYYY-MM" of disbursement; the first payment falls at the end of this month
  repayStart: string; // "YYYY-MM" repayment begins; months before it are interest-only
  // Recurring Sondertilgung
  annualExtra: number;
  extraMonth: number; // 1–12, month of the year it's paid in
  extraFromYear: number; // first calendar year it applies
  capPct: number; // yearly limit as % of the original loan; 0 = no limit
  oneOffs: OneOffRepayment[];
  appreciationPct: number;
  monthlyRunning: number; // non-recoverable running costs per month
};

export type YearRow = {
  year: number;
  interest: number;
  principal: number; // scheduled repayment only
  extra: number; // Sondertilgung
  endBalance: number;
  propertyValue: number;
  equity: number;
};

export type Simulation = {
  loan: number;
  payment: number;
  months: number;
  paidOff: boolean;
  totalInterest: number;
  totalExtra: number;
  balanceAtFixedEnd: number;
  endYear: number;
  endMonth: number;
  years: YearRow[];
  // Calendar years where the planned Sondertilgung exceeded the yearly limit
  // and was cut back to it.
  clampedYears: number[];
};

const MAX_MONTHS = 50 * 12;

// Payments from disbursement through the end of the Zinsbindung, inclusive.
export function fixedPeriodMonths(i: MortgageInputs): number {
  const startYear = Number(i.start.slice(0, 4)) || new Date().getFullYear();
  const startMonth = Math.min(12, Math.max(1, Number(i.start.slice(5, 7)) || 1));
  const endYear = Number(i.fixedEnd.slice(0, 4)) || startYear + 10;
  const endMonth = Math.min(12, Math.max(1, Number(i.fixedEnd.slice(5, 7)) || startMonth));
  return Math.max(0, (endYear - startYear) * 12 + endMonth - startMonth + 1);
}

export const propertyValueAfter = (i: MortgageInputs, months: number) => i.price * Math.pow(1 + i.appreciationPct / 100, months / 12);

export const closingCosts = (i: MortgageInputs) => (i.price * (i.taxPct + i.notaryPct + i.agentPct)) / 100;
export const loanAmount = (i: MortgageInputs) => Math.max(0, i.loan);
// Cash you bring on closing day: price plus costs, minus what the bank lends.
export const cashNeeded = (i: MortgageInputs) => Math.max(0, i.price + closingCosts(i) - i.loan);

export function simulate(i: MortgageInputs, withExtras: boolean): Simulation {
  const startYear = Number(i.start.slice(0, 4)) || new Date().getFullYear();
  const startMonth = Math.min(12, Math.max(1, Number(i.start.slice(5, 7)) || 1));
  const loan = loanAmount(i);
  const payment = (loan * (i.ratePct + i.repayPct)) / 1200;
  const cap = i.capPct > 0 ? (loan * i.capPct) / 100 : Infinity;
  const repayYear = Number(i.repayStart.slice(0, 4)) || startYear;
  const repayMonth = Math.min(12, Math.max(1, Number(i.repayStart.slice(5, 7)) || startMonth));
  const interestOnlyMonths = Math.max(0, (repayYear - startYear) * 12 + repayMonth - startMonth);
  const fixedMonths = fixedPeriodMonths(i);
  const extraUsed = new Map<number, number>();
  const clamped = new Set<number>();

  const byYear = new Map<number, YearRow>();
  let bal = loan;
  let totalInterest = 0;
  let totalExtra = 0;
  let balanceAtFixedEnd = loan;
  let months = 0;
  let endYear = startYear;
  let endMonth = startMonth;

  for (let n = 0; n < MAX_MONTHS && bal > 0.005; n++) {
    const idx = startMonth - 1 + n;
    const year = startYear + Math.floor(idx / 12);
    const month = (idx % 12) + 1;

    const interest = (bal * i.ratePct) / 1200;
    // A payment that doesn't cover the interest would grow the debt forever;
    // treat it as interest-only rather than negative amortisation.
    const principal = n < interestOnlyMonths ? 0 : Math.min(bal, Math.max(payment - interest, 0));
    bal -= principal;

    let extra = 0;
    if (withExtras && bal > 0.005) {
      const recurring = month === i.extraMonth && year >= i.extraFromYear ? i.annualExtra : 0;
      const oneOff = i.oneOffs.filter((o) => o.year === year && o.month === month).reduce((s, o) => s + o.amount, 0);
      const wanted = recurring + oneOff;
      if (wanted > 0) {
        // The yearly limit is shared by everything paid in that calendar year.
        const room = Math.max(0, cap - (extraUsed.get(year) ?? 0));
        extra = Math.max(0, Math.min(wanted, room, bal));
        if (wanted > room + 0.5 && room < bal) clamped.add(year);
        extraUsed.set(year, (extraUsed.get(year) ?? 0) + extra);
        bal -= extra;
      }
    }

    totalInterest += interest;
    totalExtra += extra;
    months = n + 1;
    endYear = year;
    endMonth = month;
    if (months === fixedMonths) balanceAtFixedEnd = bal;

    const monthsElapsed = n + 1;
    const row = byYear.get(year) ?? { year, interest: 0, principal: 0, extra: 0, endBalance: 0, propertyValue: 0, equity: 0 };
    row.interest += interest;
    row.principal += principal;
    row.extra += extra;
    row.endBalance = Math.max(bal, 0);
    row.propertyValue = propertyValueAfter(i, monthsElapsed);
    row.equity = row.propertyValue - row.endBalance;
    byYear.set(year, row);
  }

  // Paid off before the fixed period ended — nothing outstanding then.
  if (bal <= 0.005 && months < fixedMonths) balanceAtFixedEnd = 0;

  return {
    loan,
    payment,
    months,
    paidOff: bal <= 0.005,
    totalInterest,
    totalExtra,
    balanceAtFixedEnd,
    endYear,
    endMonth,
    years: Array.from(byYear.values()).sort((a, b) => a.year - b.year),
    clampedYears: Array.from(clamped).sort(),
  };
}
