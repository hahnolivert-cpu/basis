import { useMemo, useState } from "react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { monthLabel } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";
import { MonthDrilldownModal } from "@/components/MonthDrilldown";
import { useIncome } from "@/lib/hooks/useIncome";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";

const EMPTY: IncomeTransaction[] = [];

// Net dividend + interest income (less withholding tax) per month, going
// back as far as the transaction history allows.
export function IncomeHistoryCard() {
  const { data } = useIncome();
  const rows = data?.transactions ?? EMPTY;

  const monthly = useMemo(() => {
    const byMonth = new Map<string, number>();
    for (const t of rows) {
      const month = t.date.slice(0, 7);
      byMonth.set(month, (byMonth.get(month) ?? 0) + t.amountCents);
    }
    return Array.from(byMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([month, cents]) => ({ month, label: monthLabel(`${month}-01`), net: cents / 100 }));
  }, [rows]);

  const [openedMonth, setOpenedMonth] = useState<string | null>(null);

  return (
    <Card style={{ flex: 1, minWidth: "min(320px, 100%)" }}>
      <Eyebrow>Dividend + interest income · by month</Eyebrow>
      {monthly.length === 0 ? (
        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>No dividend or interest history yet.</div>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthly} margin={{ left: 8, right: 8, top: 6 }}>
              <CartesianGrid stroke={T.line} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval="preserveStartEnd" />
              <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={44} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div style={{ background: T.tooltipBg, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                      {payload[0].payload.label}: {usd(payload[0].payload.net)}
                      <div style={{ opacity: 0.7, marginTop: 2 }}>Click to view transactions</div>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="net"
                fill={T.gain}
                radius={[3, 3, 0, 0]}
                cursor="pointer"
                onClick={(d) => setOpenedMonth((d as unknown as { month: string }).month)}
              />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      {openedMonth && (
        <MonthDrilldownModal target={{ category: "income", months: [openedMonth] }} onClose={() => setOpenedMonth(null)} />
      )}
    </Card>
  );
}
