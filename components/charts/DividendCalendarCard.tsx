import { useMemo } from "react";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";
import { useIncome } from "@/lib/hooks/useIncome";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY: IncomeTransaction[] = [];

// There's no forward-looking ex-dividend/pay-date feed wired up (Polygon's
// dividend endpoint is only used for trailing yield estimates elsewhere), so
// "expected" here means "what this calendar month actually paid last time
// it came around" — the trailing 12 months, bucketed by month name rather
// than year. Honest label on the card makes clear this is a seasonal
// estimate, not a scheduled-payment calendar.
export function DividendCalendarCard() {
  const { data } = useIncome();
  const rows = data?.transactions ?? EMPTY;

  const byMonthIndex = useMemo(() => {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 365);
    const cutoffStr = cutoff.toISOString().slice(0, 10);

    const totals = new Array(12).fill(0) as number[];
    for (const t of rows) {
      if (t.date < cutoffStr) continue;
      const monthIdx = Number(t.date.slice(5, 7)) - 1;
      totals[monthIdx] += t.amountCents;
    }
    return totals;
  }, [rows]);

  const hasAny = byMonthIndex.some((v) => v !== 0);

  return (
    <Card style={{ flex: 1, minWidth: 320 }}>
      <Eyebrow style={{ marginBottom: 4 }}>Dividend calendar · expected per month</Eyebrow>
      <div style={{ fontSize: 11.5, color: T.ink, marginBottom: 12 }}>
        Estimated from what each calendar month actually paid over the trailing 12 months.
      </div>
      {!hasAny ? (
        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>No dividend or interest history yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {MONTHS.map((m, i) => (
            <div
              key={m}
              style={{
                border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 10px",
                background: byMonthIndex[i] > 0 ? "#EAF3EE" : T.card,
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: T.ink }}>{m}</div>
              <div style={{ fontFamily: mono, fontSize: 14, color: T.ink, marginTop: 2 }}>
                {byMonthIndex[i] > 0 ? usd(byMonthIndex[i] / 100) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
