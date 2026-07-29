import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono } from "@/lib/theme";
import { DRIFT } from "@/lib/data";
import { Card, Eyebrow } from "@/components/ui";

const KEYS = ["Cash", "ETFs", "Stocks", "Crypto"] as const;

export function DriftCard() {
  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Allocation drift · 19 months (% of assets)</Eyebrow>
      <div style={{ height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={DRIFT} margin={{ left: 8, right: 8, top: 6 }}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={2} />
            <YAxis unit="%" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} width={44} />
            <Tooltip
              formatter={(v, n) => [v + "%", n]}
              contentStyle={{ background: T.ink, border: "none", borderRadius: 6, fontFamily: mono, fontSize: 12 }}
              labelStyle={{ color: "#fff" }}
              itemStyle={{ color: "#fff" }}
            />
            {KEYS.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={T.chart[i]} fill={T.chart[i]} fillOpacity={0.55} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {KEYS.map((k, i) => (
          <span key={k} style={{ fontSize: 11, color: T.inkSoft, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: T.chart[i] }} />{k}
          </span>
        ))}
        <span style={{ fontSize: 11, color: T.inkSoft, marginLeft: "auto" }}>Crypto quietly grew from 6% → ~10% — the kind of drift this chart exists to catch.</span>
      </div>
    </Card>
  );
}
