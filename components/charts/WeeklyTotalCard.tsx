import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { GOALS, type WeeklyRow } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";

export function WeeklyTotalCard({ rows }: { rows: WeeklyRow[] }) {
  const latest = rows.at(-1);
  const max = Math.max(...rows.map((r) => r.total));

  // Show every goal line, plus headroom above the highest one, so the
  // remaining distance to each goal is visible rather than cropped.
  const domainMax = Math.max(...GOALS, max) * 1.08;

  return (
    <Card style={{ marginTop: 22 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow style={{ marginBottom: 0 }}>Net worth · weekly · {rows.length} weeks</Eyebrow>
        {latest && (
          <div style={{ fontFamily: mono, fontSize: 12.5, color: T.inkSoft }}>
            {usd(latest.total)} as of {latest.date}
          </div>
        )}
      </div>
      <div style={{ height: 300, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={rows} margin={{ left: 8, right: 8, top: 6 }}>
            <defs>
              <linearGradient id="weeklyTotal" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={T.ledger} stopOpacity={0.28} />
                <stop offset="100%" stopColor={T.ledger} stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={6} />
            <YAxis
              tickFormatter={usdK}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }}
              width={52}
              domain={[0, domainMax]}
            />
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    {payload[0].payload.date}: {usd(payload[0].payload.total)}
                  </div>
                ) : null
              }
            />
            {GOALS.map((g) => (
              <ReferenceLine
                key={g}
                y={g}
                stroke={T.inkSoft}
                strokeDasharray="3 4"
                strokeOpacity={0.4}
                label={{
                  value: usdK(g),
                  position: "right",
                  fill: T.inkSoft,
                  fontSize: 10,
                  fontFamily: mono,
                }}
              />
            ))}
            <Area type="monotone" dataKey="total" stroke={T.ledger} strokeWidth={2} fill="url(#weeklyTotal)" />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
