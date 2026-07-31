import { useMemo } from "react";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";
import { useIncome } from "@/lib/hooks/useIncome";
import { projectExpectedDividends } from "@/lib/expectedDividends";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";
import type { Holding } from "@/lib/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const EMPTY: IncomeTransaction[] = [];

// Forward projection, not history: each held symbol's annual expected income
// (current value × trailing yield) is split across the calendar months it
// has actually paid a dividend in before. There's no forward-looking
// ex-dividend/pay-date feed wired up, so timing is inferred from the past —
// but the dollar amounts reflect today's position sizes, not whatever was
// held when a past payment landed.
export function DividendCalendarCard({ holdings }: { holdings: Holding[] }) {
  const { data } = useIncome();
  const rows = data?.transactions ?? EMPTY;

  const projection = useMemo(() => projectExpectedDividends(holdings, rows), [holdings, rows]);
  const hasAny = projection.some((m) => m.totalCents > 0);

  const openMonth = (i: number) => window.open(`/month?category=expected&month=${i}`, "_blank");

  return (
    <Card style={{ flex: 1, minWidth: 320 }}>
      <Eyebrow style={{ marginBottom: 4 }}>Dividend calendar · expected per month</Eyebrow>
      <div style={{ fontSize: 11.5, color: T.ink, marginBottom: 12 }}>
        Projected from current holdings&apos; yield, spread across each symbol&apos;s historical payment months.
      </div>
      {!hasAny ? (
        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>Not enough dividend history to project a schedule yet.</div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
          {MONTHS.map((m, i) => (
            <div
              key={m}
              onClick={() => projection[i].totalCents > 0 && openMonth(i)}
              style={{
                border: `1px solid ${T.line}`, borderRadius: 8, padding: "8px 10px",
                background: projection[i].totalCents > 0 ? "#EAF3EE" : T.card,
                cursor: projection[i].totalCents > 0 ? "pointer" : "default",
              }}
            >
              <div style={{ fontSize: 10, letterSpacing: "0.06em", textTransform: "uppercase", color: T.ink }}>{m}</div>
              <div style={{ fontFamily: mono, fontSize: 14, color: T.ink, marginTop: 2 }}>
                {projection[i].totalCents > 0 ? usd(projection[i].totalCents / 100) : "—"}
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
