import type { WeeklySnapshot } from "./types";

export const GOALS = [1e6, 3e6, 5e6];

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

// Weeks until `goal` is reached, projecting the trailing average *dollar*
// change per week (not a compound growth rate) forward at a constant pace.
// A $/week pace is more legible against a volatile, crypto-heavy portfolio
// than a % growth rate, which can swing wildly week to week. Returns null
// when there's nothing to project: too little history, or a flat/negative
// trend — an ETA on a shrinking portfolio would be a fabricated number, not
// just an optimistic one.
export function weeksToGoal(rows: WeeklyRow[], goal: number): number | null {
  if (rows.length < 2) return null;
  const first = rows[0].total;
  const latest = rows[rows.length - 1].total;
  if (latest >= goal) return 0;
  const weeks = rows.length - 1;
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
