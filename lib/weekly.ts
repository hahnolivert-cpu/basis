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
