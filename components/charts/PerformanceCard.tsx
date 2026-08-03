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
// fundamentally not the same kind of number as week/month/YTD/1Y, which are
// all comparisons against the weekly history (see computePerformance).
// Mixing them in one row is still the right call: it's what "performance"
// means colloquially, one glance across every horizon.
//
// `currentInvestments` is crypto + equities only, live, no cash and no
// Angel Investment — cash moving (deposits, withdrawals, a treasury sweep)
// isn't investment performance, and Angel investments never had a snapshot
// history to compare against. It's also the *live* figure, not the latest
// weekly snapshot the way GoalProgressCard uses it — this should reflect
// what happened up through right now, not just through last Sunday.
export function PerformanceCard({
  rows,
  currentInvestments,
  todayPct,
  todayAmt,
}: {
  rows: WeeklyRow[];
  currentInvestments: number;
  todayPct: number;
  todayAmt: number;
}) {
  const stats = computePerformance(rows, currentInvestments);

  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Performance</Eyebrow>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(84px, 1fr))", gap: 16 }}>
        <Stat label="Today" pct={todayPct} amt={todayAmt} />
        {stats.map((s) => (
          <Stat key={s.key} label={s.label} pct={s.pct} amt={s.amt} unavailable={s.unavailable} />
        ))}
      </div>
    </Card>
  );
}
