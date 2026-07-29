import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis,
} from "recharts";
import { T, mono } from "@/lib/theme";
import { Card, Eyebrow } from "@/components/ui";
import { ChartTip } from "./ChartTip";
import type { NamedValue } from "@/lib/types";

export function CompositionCard({
  title,
  data,
  total,
  donut,
  flex = 1,
}: {
  title: string;
  data: NamedValue[];
  total: number;
  donut?: boolean;
  flex?: number;
}) {
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, d) => s + d.value, 0);
  const rows = rest > 0 ? [...top, { name: "Other", value: rest }] : top;
  return (
    <Card style={{ flex, minWidth: 260 }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ height: 185 }}>
        <ResponsiveContainer width="100%" height="100%">
          {donut ? (
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius={46} outerRadius={76} paddingAngle={2} strokeWidth={0}>
                {rows.map((_, i) => <Cell key={i} fill={T.chart[i % T.chart.length]} />)}
              </Pie>
              <Tooltip content={<ChartTip total={total} />} />
            </PieChart>
          ) : (
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
              <Tooltip content={<ChartTip total={total} />} cursor={{ fill: "rgba(14,91,67,0.06)" }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                {rows.map((d, i) => <Cell key={i} fill={d.name === "ETFs (opaque)" ? "#B9C6BE" : T.chart[i % T.chart.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {rows.map((d, i) => (
          <span key={`${d.name}-${i}`} style={{ fontSize: 11, color: T.inkSoft, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: d.name === "ETFs (opaque)" && !donut ? "#B9C6BE" : T.chart[i % T.chart.length] }} />
            {d.name} {((d.value / total) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </Card>
  );
}
