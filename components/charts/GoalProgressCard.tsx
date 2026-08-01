import { T, mono, serif } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { GOALS, weeksToGoal, etaLabel, type WeeklyRow } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";

export function GoalProgressCard({ rows, angelValue = 0 }: { rows: WeeklyRow[]; angelValue?: number }) {
  const latest = rows[rows.length - 1];
  const total = latest.total;
  // angelValue (Strala, when its own "in net worth" toggle is on) sits
  // outside the tracked weekly series entirely — see WeeklyTotalCard. Rather
  // than bolt it onto `total` and lose the trailing $/week pace that
  // weeksToGoal derives from real history, it's simplest to fold it into the
  // goal instead: reaching (goal - angelValue) on the tracked series is
  // exactly equivalent to reaching `goal` once Strala's counted in.
  const effectiveTotal = total + angelValue;
  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Goal progress</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {GOALS.map((goal) => {
          const pct = (effectiveTotal / goal) * 100;
          const achieved = effectiveTotal >= goal;
          const weeks = achieved ? null : weeksToGoal(rows, goal - angelValue);
          return (
            <div key={goal}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, marginBottom: 5 }}>
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
              <div style={{ height: 9, background: "#EDF2EE", borderRadius: 5, overflow: "hidden" }}>
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
        dollar change per week across all recorded weeks — not a guarantee.
      </div>
    </Card>
  );
}
