import { useMemo } from "react";
import { BarChart, Bar, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { monthLabel } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";
import { useMonthlyFlows } from "@/lib/hooks/useMonthlyFlows";
import type { MonthlyFlow } from "@/app/api/monthly-flows/route";

const EMPTY: MonthlyFlow[] = [];

// How much was bought vs sold each month, going back as far as transaction
// history allows.
export function MonthlyActivityCard() {
  const { data } = useMonthlyFlows();
  const months = data?.months ?? EMPTY;

  const rows = useMemo(
    () => months.map((m) => ({ label: monthLabel(`${m.month}-01`), invested: m.invested / 100, sold: m.sold / 100 })),
    [months]
  );

  return (
    <Card style={{ flex: 1, minWidth: 320 }}>
      <Eyebrow>Invested vs sold · by month</Eyebrow>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>No buy or sell history yet.</div>
      ) : (
        <div style={{ height: 200 }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ left: 8, right: 8, top: 6 }}>
              <CartesianGrid stroke={T.line} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval={Math.ceil(rows.length / 12)} />
              <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={44} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                      <div>{payload[0].payload.label}</div>
                      <div>Invested: {usd(payload[0].payload.invested)}</div>
                      <div>Sold: {usd(payload[0].payload.sold)}</div>
                    </div>
                  ) : null
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: T.ink }} />
              <Bar dataKey="invested" name="Invested" fill={T.gain} radius={[3, 3, 0, 0]} />
              <Bar dataKey="sold" name="Sold" fill={T.loss} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
