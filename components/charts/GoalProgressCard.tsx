import { T, mono, serif } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { GOALS, weeksToGoal, etaLabel, type WeeklyRow } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";

export function GoalProgressCard({ rows }: { rows: WeeklyRow[] }) {
  const latest = rows[rows.length - 1];
  const total = latest.total;
  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Goal progress</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        {GOALS.map((goal) => {
          const pct = (total / goal) * 100;
          const achieved = total >= goal;
          const weeks = achieved ? null : weeksToGoal(rows, goal);
          return (
            <div key={goal}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", fontSize: 12.5, marginBottom: 5 }}>
                <span style={{ fontWeight: 600, fontFamily: serif, fontSize: 15 }}>{usdK(goal)}</span>
                <span style={{ fontFamily: mono, color: achieved ? T.gain : T.inkSoft }}>
                  {achieved ? (
                    <>achieved ✓ <span style={{ color: T.inkSoft }}>· {pct.toFixed(0)}%</span></>
                  ) : (
                    <>
                      {pct.toFixed(1)}% <span style={{ opacity: 0.75 }}>· {usd(goal - total)} to go</span>
                      {weeks !== null && (
                        <span style={{ color: T.ledger, marginLeft: 8 }}>{etaLabel(weeks, latest.date)}</span>
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
                    background: achieved ? T.gain : T.ledger,
                    borderRadius: 5,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
      <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 12 }}>
        Measured against the latest weekly close of {usd(total)}. Estimated dates project the trailing
        average dollar change per week across all recorded weeks — not a guarantee.
      </div>
    </Card>
  );
}
