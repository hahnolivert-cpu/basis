import type { ReactNode } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, LabelList,
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
  onSegmentClick,
  minPct,
  headerRight,
}: {
  title: string;
  data: NamedValue[];
  total: number;
  donut?: boolean;
  flex?: number;
  // "Other" folds several small buckets into one slice, so a click on it
  // needs every folded bucket's name, not just "Other" itself.
  onSegmentClick?: (name: string, foldedNames: string[]) => void;
  // Fold anything under this share into "Other" instead of the default
  // top-7-by-count cutoff — e.g. Geography wants every sub-3% sliver merged
  // regardless of how many that is.
  minPct?: number;
  // Optional control (e.g. a Toggle) rendered next to the title.
  headerRight?: ReactNode;
}) {
  const keep = minPct !== undefined ? data.filter((d) => (d.value / total) * 100 >= minPct) : data.slice(0, 7);
  const folded = minPct !== undefined ? data.filter((d) => (d.value / total) * 100 < minPct) : data.slice(7);
  const restNames = folded.map((d) => d.name);
  const rest = folded.reduce((s, d) => s + d.value, 0);
  const rows = rest > 0 ? [...keep, { name: "Other", value: rest }] : keep;
  const click = (name: string) => onSegmentClick?.(name, name === "Other" ? restNames : [name]);
  return (
    <Card style={{ flex, minWidth: 420 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <Eyebrow>{title}</Eyebrow>
        {headerRight}
      </div>
      <div style={{ height: 185 }}>
        <ResponsiveContainer width="100%" height="100%">
          {donut ? (
            <PieChart>
              <Pie
                data={rows}
                dataKey="value"
                nameKey="name"
                innerRadius={46}
                outerRadius={76}
                paddingAngle={2}
                strokeWidth={0}
                label={({ cx, cy, midAngle = 0, innerRadius: ir, outerRadius: or, percent = 0 }) => {
                  // Same percentage format as the legend below, shown directly
                  // on the slice — a small slice's label would just overlap
                  // its neighbors, so those stay legend-only.
                  if (percent < 0.05) return null;
                  const RADIAN = Math.PI / 180;
                  const r = ir + (or - ir) * 0.55;
                  const x = cx + r * Math.cos(-midAngle * RADIAN);
                  const y = cy + r * Math.sin(-midAngle * RADIAN);
                  return (
                    <text x={x} y={y} fill="#fff" textAnchor="middle" dominantBaseline="central" fontFamily={mono} fontSize={10.5} fontWeight={600}>
                      {`${(percent * 100).toFixed(0)}%`}
                    </text>
                  );
                }}
                labelLine={false}
              >
                {rows.map((d, i) => (
                  <Cell
                    key={i}
                    fill={T.chart[i % T.chart.length]}
                    cursor={onSegmentClick ? "pointer" : undefined}
                    onClick={() => click(d.name)}
                  />
                ))}
              </Pie>
              <Tooltip content={<ChartTip total={total} />} />
            </PieChart>
          ) : (
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 34 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
              <Tooltip content={<ChartTip total={total} />} cursor={{ fill: "rgba(14,91,67,0.06)" }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                <LabelList
                  dataKey="value"
                  position="right"
                  formatter={(v) => `${((Number(v) / total) * 100).toFixed(0)}%`}
                  style={{ fontSize: 10.5, fill: T.ink, fontFamily: mono, fontWeight: 600 }}
                />
                {rows.map((d, i) => (
                  <Cell
                    key={i}
                    fill={d.name === "ETFs (opaque)" ? "#B9C6BE" : T.chart[i % T.chart.length]}
                    cursor={onSegmentClick ? "pointer" : undefined}
                    onClick={() => click(d.name)}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {rows.map((d, i) => (
          <span
            key={`${d.name}-${i}`}
            onClick={() => click(d.name)}
            style={{
              fontSize: 11, color: T.inkSoft, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5,
              cursor: onSegmentClick ? "pointer" : undefined,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 2, background: d.name === "ETFs (opaque)" && !donut ? "#B9C6BE" : T.chart[i % T.chart.length] }} />
            {d.name} {((d.value / total) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </Card>
  );
}
