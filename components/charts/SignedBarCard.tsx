import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell } from "recharts";
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
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 14 }}>
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
              {rows.map((d, i) => <Cell key={i} fill={d.v >= 0 ? T.gain : T.loss} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {note && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>{note}</div>}
    </Card>
  );
}
