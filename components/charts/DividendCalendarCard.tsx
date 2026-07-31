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
// "expected" here means "what this calendar month actually paid" within
// whatever range the Dividends tab has selected, bucketed by month name
// rather than year — defaults to the trailing 365 days when no range is
// passed. Honest label makes clear this reflects actual history, not a
// scheduled-payment calendar.
export function DividendCalendarCard({ dateFrom, dateTo }: { dateFrom?: string; dateTo?: string }) {
  const { data } = useIncome();
  const rows = data?.transactions ?? EMPTY;

  const { totals, occurrences } = useMemo(() => {
    const from = dateFrom ?? (() => {
      const d = new Date();
      d.setDate(d.getDate() - 365);
      return d.toISOString().slice(0, 10);
    })();
    const to = dateTo || new Date().toISOString().slice(0, 10);

    const totals = new Array(12).fill(0) as number[];
    const occurrences: string[][] = Array.from({ length: 12 }, () => []);
    for (const t of rows) {
      if (t.date < from || t.date > to) continue;
      const monthIdx = Number(t.date.slice(5, 7)) - 1;
      totals[monthIdx] += t.amountCents;
      const ym = t.date.slice(0, 7);
      if (!occurrences[monthIdx].includes(ym)) occurrences[monthIdx].push(ym);
    }
    return { totals, occurrences };
  }, [rows, dateFrom, dateTo]);

  const hasAny = totals.some((v) => v !== 0);

  const openMonths = (ym: string[]) => {
    if (ym.length === 0) return;
    window.open(`/month?months=${ym.join(",")}&category=income`, "_blank");
  };

  return (
    <Card style={{ flex: 1, minWidth: 320 }}>
      <Eyebrow style={{ marginBottom: 4 }}>Dividend calendar · expected per month</Eyebrow>
      <div style={{ fontSize: 11.5, color: T.ink, marginBottom: 12 }}>
        What each calendar month actually paid in the selected date range.
      </div>
      {!hasAny ? (
        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>No dividend or interest history in this period.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {MONTHS.map((m, i) => (
            <div
              key={m}
              onClick={() => openMonths(occurrences[i])}
              style={{
                border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 10px",
                background: totals[i] > 0 ? "#EAF3EE" : T.card,
                cursor: occurrences[i].length > 0 ? "pointer" : "default",
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: T.ink }}>{m}</div>
              <div style={{ fontFamily: mono, fontSize: 14, color: T.ink, marginTop: 2 }}>
                {totals[i] > 0 ? usd(totals[i] / 100) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
