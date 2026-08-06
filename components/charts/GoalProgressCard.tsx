import { T, mono, serif } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { GOALS, weeksToGoal, etaLabel, type WeeklyRow, type GoalProjectionMode } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";
import { usePersistedState } from "@/lib/hooks/usePersistedState";

const MODES: { key: GoalProjectionMode; label: string }[] = [
  { key: "amount", label: "$/wk" },
  { key: "percent", label: "%/wk" },
];

export function GoalProgressCard({ rows, angelValue = 0 }: { rows: WeeklyRow[]; angelValue?: number }) {
  const [mode, setMode] = usePersistedState<GoalProjectionMode>("goals.projectionMode", "amount");
  const latest = rows[rows.length - 1];
  const total = latest.total;
  // angelValue (Strala, when its own "in net worth" toggle is on) sits
  // outside the tracked weekly series entirely — see WeeklyTotalCard. Rather
  // than bolt it onto `total` and lose the trailing pace that weeksToGoal
  // derives from real history, it's simplest to fold it into the goal
  // instead: reaching (goal - angelValue) on the tracked series is exactly
  // equivalent to reaching `goal` once Strala's counted in.
  const effectiveTotal = total + angelValue;
  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <Eyebrow style={{ marginBottom: 0 }}>Goal progress</Eyebrow>
        <div style={{ display: "flex", gap: 2, background: T.headerBg, borderRadius: 999, padding: 2 }}>
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => setMode(m.key)}
              title={m.key === "amount" ? "Project using average dollar change per week" : "Project using average percent change per week (compounding)"}
              style={{
                border: "none", cursor: "pointer", padding: "4px 10px", fontFamily: mono, borderRadius: 999,
                fontSize: 11, fontWeight: mode === m.key ? 700 : 500,
                background: mode === m.key ? T.gain : "none", color: mode === m.key ? "#fff" : T.inkSoft,
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {GOALS.map((goal) => {
          const pct = (effectiveTotal / goal) * 100;
          const achieved = effectiveTotal >= goal;
          const weeks = achieved ? null : weeksToGoal(rows, goal - angelValue, mode);
          return (
            <div key={goal}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", rowGap: 2, columnGap: 10, fontSize: 12.5, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, fontFamily: serif, fontSize: 15 }}>{usdK(goal)}</span>
                <span style={{ fontFamily: mono, color: achieved ? T.gain : T.ink }}>
                  {achieved ? (
                    <>achieved ✓ <span style={{ color: T.ink }}>· {pct.toFixed(0)}%</span></>
                  ) : (
                    <>
                      {pct.toFixed(1)}% <span style={{ opacity: 0.75 }}>· {usd(goal - effectiveTotal)} to go</span>
                      {weeks !== null && (
                        <span style={{ color: T.gain, marginLeft: 8 }}>{etaLabel(weeks, latest.date)}</span>
                      )}
                    </>
                  )}
                </span>
              </div>
              <div style={{ height: 9, background: T.track, borderRadius: 5, overflow: "hidden" }}>
                <div
                  style={{
                    height: "100%",
                    width: `${Math.min(pct, 100)}%`,
                    background: T.gain,
                    borderRadius: 5,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: T.ink, marginTop: 12 }}>
        Measured against the latest weekly close of {usd(total)}
        {angelValue > 0 && <> plus {usd(angelValue)} from Strala</>}. Estimated dates project the trailing average
        {mode === "amount" ? " dollar change per week" : " percent change per week, compounding"} across all recorded
        weeks — not a guarantee.
      </div>
    </Card>
  );
}
