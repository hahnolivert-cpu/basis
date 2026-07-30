import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono } from "@/lib/theme";
import { Card, Eyebrow } from "@/components/ui";

export type CompositionPoint = { m: string; [bucket: string]: number | string };

// `bands` is drawn in the order given (bottom of the stack first) and also
// decides which keys of `points` are plotted — generic over however many
// asset-class buckets the caller is projecting.
export function CompositionForecastCard({
  points,
  bands,
  caption,
}: {
  points: CompositionPoint[];
  bands: [string, string][];
  caption?: string;
}) {
  const pctOf = (p: CompositionPoint, k: string) => {
    const total = bands.reduce((s, [key]) => s + (Number(p[key]) || 0), 0);
    return total ? ((Number(p[k]) || 0) / total) * 100 : 0;
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Composition forecast · % of assets</Eyebrow>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* stackOffset="expand" normalises each year to 1.0, giving a true
              100% stacked band regardless of how the total dollar amount grew. */}
          <AreaChart data={points} stackOffset="expand" margin={{ left: 8, right: 8, top: 6 }}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={3} />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }}
              width={44}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as CompositionPoint;
                return (
                  <div style={{ background: T.ink, color: "#fff", padding: "7px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    <div style={{ marginBottom: 3 }}>{p.m}</div>
                    {bands.map(([k]) => (
                      <div key={k}>
                        {k} {pctOf(p, k).toFixed(1)}%
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {bands.map(([k, color]) => (
              <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={color} fill={color} fillOpacity={0.62} strokeWidth={1.4} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        {bands.map(([k, color]) => (
          <span key={k} style={{ fontSize: 11, color: T.inkSoft, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {k}
          </span>
        ))}
        {caption && <span style={{ fontSize: 11, color: T.inkSoft, marginLeft: "auto" }}>{caption}</span>}
      </div>
    </Card>
  );
}
