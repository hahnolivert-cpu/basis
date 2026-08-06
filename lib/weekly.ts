import type { WeeklySnapshot } from "./types";

export const GOALS = [1e6, 3e6, 5e6, 1e7, 2e7];

// A weekly row with dollars and derived figures for charts and the table.
export type WeeklyRow = {
  date: string;
  label: string;
  crypto: number;
  equities: number;
  cash: number;
  total: number;
  eur: number;
  btc: number;
  wowAmt: number | null;
  wowPct: number | null;
  source: "import" | "auto";
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "2025-04-06" -> "Apr 25". Parsed as UTC so the label can't slip a day in
// timezones behind UTC.
export function monthLabel(date: string): string {
  const [y, m] = date.split("-");
  return `${MONTHS[Number(m) - 1]} ${y.slice(2)}`;
}

export type GoalProjectionMode = "amount" | "percent";

// Weeks until `goal` is reached, projecting the trailing average pace
// forward at a constant rate — either a *dollar* change per week (linear)
// or a *percent* change per week (compounding). $/week is more legible
// against a volatile, crypto-heavy portfolio than a % growth rate, which
// can swing wildly week to week on a small base; % better reflects real
// compounding once a portfolio is mostly invested rather than growing from
// new deposits. Neither is strictly more correct, so both are offered
// rather than picking one. Returns null when there's nothing to project:
// too little history, a flat/negative trend, or (percent mode) a
// non-positive starting value — an ETA on a shrinking portfolio would be a
// fabricated number, not just an optimistic one.
export function weeksToGoal(rows: WeeklyRow[], goal: number, mode: GoalProjectionMode = "amount"): number | null {
  if (rows.length < 2) return null;
  const first = rows[0].total;
  const latest = rows[rows.length - 1].total;
  if (latest >= goal) return 0;
  const weeks = rows.length - 1;

  if (mode === "percent") {
    if (first <= 0 || latest <= 0) return null;
    const weeklyRate = Math.pow(latest / first, 1 / weeks) - 1;
    if (weeklyRate <= 0) return null;
    return Math.log(goal / latest) / Math.log(1 + weeklyRate);
  }

  const avgWeeklyChange = (latest - first) / weeks;
  if (avgWeeklyChange <= 0) return null;
  return (goal - latest) / avgWeeklyChange;
}

// "~2.3 yrs · Nov 2028" from a week count and the date it's counted from.
export function etaLabel(weeks: number, fromDate: string): string {
  const d = new Date(`${fromDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Math.round(weeks * 7));
  const dateLabel = `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  const years = weeks / 52.18;
  const span = years >= 1 ? `${years.toFixed(1)} yrs` : `${Math.round(weeks)} wks`;
  return `~${span} · ${dateLabel}`;
}

export type PerformanceStat = { key: string; label: string; pct: number | null; amt: number | null; unavailable?: string };

// Latest row with a date on or before `targetDate` — `rows` is ascending by
// date (see app/api/weekly-snapshots), so the last match wins.
function rowOnOrBefore(rows: WeeklyRow[], targetDate: string): WeeklyRow | null {
  let found: WeeklyRow | null = null;
  for (const r of rows) {
    if (r.date <= targetDate) found = r;
    else break;
  }
  return found;
}

// "2026-08-03" minus 30 days, in UTC so it can't slip a day depending on the
// caller's timezone.
function isoDaysAgo(from: Date, days: number): string {
  const d = new Date(from);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// Week/month/YTD/1Y change in gross net worth (crypto + equities + cash —
// the same basis WeeklyTotalCard and GoalProgressCard already use, not net
// of debts) versus the nearest weekly snapshot on or before each lookback
// point. `currentTotal` should be on that same gross basis — this function
// only does the date math. A period older than the earliest snapshot (real
// history only goes back to whenever the spreadsheet import started) comes
// back with `unavailable` set instead of a fabricated number — there's no
// "Today" here since that's an intraday live figure, not a snapshot
// comparison; the caller supplies it separately.
export function computePerformance(rows: WeeklyRow[], currentTotal: number, asOf: Date = new Date()): PerformanceStat[] {
  if (rows.length === 0) return [];
  const earliestDate = rows[0].date;

  const lookback = (key: string, label: string, targetDate: string): PerformanceStat => {
    if (targetDate < earliestDate) {
      return { key, label, pct: null, amt: null, unavailable: `history starts ${monthLabel(earliestDate)}` };
    }
    const base = rowOnOrBefore(rows, targetDate);
    if (!base || base.total === 0) return { key, label, pct: null, amt: null, unavailable: "no data" };
    const amt = currentTotal - base.total;
    return { key, label, pct: (amt / base.total) * 100, amt };
  };

  const jan1 = `${asOf.getUTCFullYear()}-01-01`;

  return [
    lookback("week", "1W", isoDaysAgo(asOf, 7)),
    lookback("month", "1M", isoDaysAgo(asOf, 30)),
    lookback("ytd", "YTD", jan1),
    lookback("1y", "1Y", isoDaysAgo(asOf, 365)),
  ];
}

export function toRows(snapshots: WeeklySnapshot[]): WeeklyRow[] {
  return snapshots.map((s, i) => {
    const total = s.total_cents / 100;
    const prev = i > 0 ? snapshots[i - 1].total_cents / 100 : null;
    return {
      date: s.sunday_date,
      label: monthLabel(s.sunday_date),
      crypto: s.crypto_cents / 100,
      equities: s.equities_cents / 100,
      cash: s.cash_cents / 100,
      total,
      eur: total * s.usd_to_eur,
      btc: total / s.btc_price_usd,
      wowAmt: prev === null ? null : total - prev,
      wowPct: prev === null || prev === 0 ? null : ((total - prev) / prev) * 100,
      source: s.source,
    };
  });
}
