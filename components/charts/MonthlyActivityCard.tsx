import { useMemo } from "react";
import { ComposedChart, Bar, Line, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, Legend, ReferenceLine } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { monthLabel } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";
import { useMonthlyFlows } from "@/lib/hooks/useMonthlyFlows";
import type { MonthlyFlow } from "@/app/api/monthly-flows/route";

const EMPTY: MonthlyFlow[] = [];

// Invested and sold render as one diverging bar per month — invested above
// zero, sold as a negative value below it — with net invested overlaid as a
// line, so the net direction is visible at a glance instead of having to
// compare two separate bar heights.
export function MonthlyActivityCard() {
  const { data } = useMonthlyFlows();
  const months = data?.months ?? EMPTY;

  const rows = useMemo(
    () =>
      months.map((m) => {
        const invested = m.invested / 100;
        const sold = m.sold / 100;
        return { month: m.month, label: monthLabel(`${m.month}-01`), invested, sold: -sold, net: invested - sold };
      }),
    [months]
  );

  const openMonth = (month: string) => window.open(`/month?months=${month}&category=activity`, "_blank");

  return (
    <Card style={{ flex: 1, minWidth: "min(320px, 100%)" }}>
      <Eyebrow>Invested vs sold · net by month</Eyebrow>
      {rows.length === 0 ? (
        <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>No buy or sell history yet.</div>
      ) : (
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={rows} stackOffset="sign" margin={{ left: 8, right: 8, top: 6 }}>
              <CartesianGrid stroke={T.line} vertical={false} />
              <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval="preserveStartEnd" />
              <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={44} />
              <ReferenceLine y={0} stroke={T.line} />
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                      <div>{payload[0].payload.label}</div>
                      <div>Invested: {usd(payload[0].payload.invested)}</div>
                      <div>Sold: {usd(-payload[0].payload.sold)}</div>
                      <div>Net: {usd(payload[0].payload.net)}</div>
                      <div style={{ opacity: 0.7, marginTop: 2 }}>Click to view transactions</div>
                    </div>
                  ) : null
                }
              />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: T.ink }} />
              <Bar
                dataKey="invested"
                name="Invested"
                stackId="flow"
                fill={T.gain}
                radius={[3, 3, 0, 0]}
                cursor="pointer"
                onClick={(d) => openMonth((d as unknown as { month: string }).month)}
              />
              <Bar
                dataKey="sold"
                name="Sold"
                stackId="flow"
                fill={T.loss}
                radius={[0, 0, 3, 3]}
                cursor="pointer"
                onClick={(d) => openMonth((d as unknown as { month: string }).month)}
              />
              <Line type="monotone" dataKey="net" name="Net invested" stroke={T.ink} strokeWidth={2} dot={{ r: 3, fill: T.ink }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
