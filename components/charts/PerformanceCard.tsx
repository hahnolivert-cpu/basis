import { T, mono } from "@/lib/theme";
import { sign, usd } from "@/lib/format";
import { computePerformance, type WeeklyRow } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";

function Stat({ label, pct, amt, unavailable }: { label: string; pct: number | null; amt: number | null; unavailable?: string }) {
  const color = pct === null ? T.ink : pct >= 0 ? T.gain : T.loss;
  return (
    <div>
      <div style={{ fontSize: 10.5, letterSpacing: "0.08em", textTransform: "uppercase", color: T.ink, marginBottom: 4 }}>{label}</div>
      {pct === null || amt === null ? (
        <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }} title={unavailable}>
          —
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.4 }}>
          <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color }}>{sign(pct, pct.toFixed(2))}%</span>
          <span style={{ fontFamily: mono, fontSize: 11.5, color, opacity: 0.75 }}>{sign(amt, usd(amt))}</span>
        </div>
      )}
    </div>
  );
}

// Today is a live intraday figure (from quotes, computed by the caller) —
// fundamentally not the same kind of number as week/month/YTD/1Y/5Y, which
// are all comparisons against the weekly history (see computePerformance).
// Mixing them in one row is still the right call: it's what "performance"
// means colloquially, one glance across every horizon.
//
// `currentTotal` is deliberately the *live* gross total (crypto + equities
// + cash, no Angel Investment — see app/page.tsx's liveGrossTotal), not the
// latest weekly snapshot the way GoalProgressCard uses it — a performance
// card should reflect what happened since a snapshot up through right now,
// not just up through last Sunday. Angel investments are left out entirely
// rather than folded in like GoalProgressCard does: they never had a
// snapshot history to begin with, so if Strala's own toggle is on, adding
// its value only to `currentTotal` (never to the historical base) would
// read as a fake one-week +$750k jump the moment the toggle flips.
export function PerformanceCard({ rows, currentTotal, todayPct, todayAmt }: { rows: WeeklyRow[]; currentTotal: number; todayPct: number; todayAmt: number }) {
  const stats = computePerformance(rows, currentTotal);

  return (
    <Card style={{ marginTop: 22 }}>
      <Eyebrow>Performance</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 16 }}>
        <Stat label="Today" pct={todayPct} amt={todayAmt} />
        {stats.map((s) => (
          <Stat key={s.key} label={s.label} pct={s.pct} amt={s.amt} unavailable={s.unavailable} />
        ))}
      </div>
      <div style={{ fontSize: 11.5, color: T.ink, marginTop: 14 }}>
        Right now vs. the nearest weekly close on or before each date — gross portfolio total (crypto + equities +
        cash, not net of debts, and not counting Angel Investments), same basis as the chart and goals above. A dash
        means history doesn&apos;t go back that far yet.
      </div>
    </Card>
  );
}
