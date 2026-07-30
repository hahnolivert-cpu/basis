import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, Cell, useXAxisScale, useYAxisScale } from "recharts";
import { T, mono } from "@/lib/theme";
import { Card, Eyebrow } from "@/components/ui";

type Row = { name: string; v: number; pct?: number };

const pctLabel = (pct: number) => `${pct >= 0 ? "+" : ""}${pct.toFixed(2)}%`;

// Draws each row's value label right at the zero baseline, on the empty side
// (not on top of the bar) — a green bar grows rightward from zero, so its
// label sits just to the left of zero; a red bar grows leftward, so its
// label sits just to the right. That keeps every label in one aligned
// column in black text over the plain card background, legible regardless
// of how long or short the bar is, instead of chasing each bar's own tip.
// Reads the row's own pixel position from the chart's real scales —
// LabelList's content callback only ever gets x/y/width/height/value, never
// the full row, so a negative bar's % change isn't reachable that way.
function BarLabels({ rows, fmtV }: { rows: Row[]; fmtV: (v: number) => string }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  const zeroX = xScale(0);
  if (zeroX === undefined) return null;
  return (
    <g>
      {rows.map((r) => {
        const y = yScale(r.name, { position: "middle" });
        if (y === undefined) return null;
        const positive = r.v >= 0;
        const label = r.pct !== undefined ? `${fmtV(r.v)} (${pctLabel(r.pct)})` : fmtV(r.v);
        return (
          <text
            key={r.name}
            x={positive ? zeroX - 6 : zeroX + 6}
            y={y}
            textAnchor={positive ? "end" : "start"}
            dominantBaseline="middle"
            fontFamily={mono}
            fontSize={10.5}
            fontWeight={600}
            fill={T.ink}
          >
            {label}
          </text>
        );
      })}
    </g>
  );
}

export function SignedBarCard({
  title,
  rows,
  fmtV,
  note,
}: {
  title: string;
  rows: Row[];
  fmtV: (v: number) => string;
  note?: string;
}) {
  return (
    <Card style={{ flex: 1, minWidth: 300 }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ height: Math.max(200, rows.length * 32) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 10, right: 16 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={66} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
            <Tooltip
              cursor={{ fill: "rgba(14,91,67,0.06)" }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as Row;
                return (
                  <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    {r.name}: {fmtV(r.v)}
                    {r.pct !== undefined && ` (${pctLabel(r.pct)})`}
                  </div>
                );
              }}
            />
            <Bar dataKey="v" radius={[0, 4, 4, 0]} barSize={13}>
              {rows.map((d, i) => (
                <Cell key={i} fill={d.v >= 0 ? T.gain : T.loss} />
              ))}
            </Bar>
            <BarLabels rows={rows} fmtV={fmtV} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      {note && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>{note}</div>}
    </Card>
  );
}
