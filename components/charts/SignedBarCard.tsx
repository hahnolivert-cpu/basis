import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, LabelList } from "recharts";
import { T, mono } from "@/lib/theme";
import { Card, Eyebrow } from "@/components/ui";

export function SignedBarCard({
  title,
  rows,
  fmtV,
  note,
}: {
  title: string;
  rows: { name: string; v: number }[];
  fmtV: (v: number) => string;
  note?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 300 }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ height: Math.max(200, rows.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 46 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={66} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
            <Tooltip
              cursor={{ fill: "rgba(14,91,67,0.06)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    {payload[0].payload.name}: {fmtV(payload[0].value as number)}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="v" radius={[0, 4, 4, 0]} barSize={13}>
              <LabelList
                dataKey="v"
                // A negative bar's rect still reports x as its left edge —
                // labeling every bar on the "right" put a loss's number right
                // on top of the category name instead of past the bar's tip.
                content={({ x, y, width, height, value }) => {
                  const v = Number(value);
                  const positive = v >= 0;
                  const lx = positive ? Number(x) + Number(width) + 6 : Number(x) - 6;
                  return (
                    <text
                      x={lx}
                      y={Number(y) + Number(height) / 2}
                      textAnchor={positive ? "start" : "end"}
                      dominantBaseline="middle"
                      fontFamily={mono}
                      fontSize={10.5}
                      fontWeight={600}
                      fill={T.ink}
                    >
                      {fmtV(v)}
                    </text>
                  );
                }}
              />
              {rows.map((d, i) => <Cell key={i} fill={d.v >= 0 ? T.gain : T.loss} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {note && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>{note}</div>}
    </Card>
  );
}
