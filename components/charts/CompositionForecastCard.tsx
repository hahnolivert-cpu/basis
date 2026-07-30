import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";

export type CompositionPoint = { m: string; [bucket: string]: number | string };

// `bands` is drawn in the order given (bottom of the stack first) and also
// decides which keys of `points` are plotted — generic over however many
// asset-class buckets the caller is projecting. `mode` picks between a
// normalized 100% stacked view (share of assets) and a plain stacked view
// in absolute dollars (how big each bucket actually gets) — same data,
// two different questions.
export function CompositionForecastCard({
  points,
  bands,
  caption,
  mode = "pct",
}: {
  points: CompositionPoint[];
  bands: [string, string][];
  caption?: string;
  mode?: "pct" | "dollar";
}) {
  const pctOf = (p: CompositionPoint, k: string) => {
    const total = bands.reduce((s, [key]) => s + (Number(p[key]) || 0), 0);
    return total ? ((Number(p[k]) || 0) / total) * 100 : 0;
  };

  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>{mode === "pct" ? "Composition forecast · % of assets" : "Composition forecast · $ by bucket"}</Eyebrow>
      <div style={{ height: 240 }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* stackOffset="expand" normalises each year to 1.0, giving a true
              100% stacked band regardless of how the total dollar amount grew;
              omitted in dollar mode so the bands' real size is what's plotted. */}
          <AreaChart data={points} stackOffset={mode === "pct" ? "expand" : undefined} margin={{ left: 8, right: 8, top: 6 }}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval={3} />
            <YAxis
              tickFormatter={mode === "pct" ? (v: number) => `${Math.round(v * 100)}%` : usdK}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }}
              width={mode === "pct" ? 44 : 52}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as CompositionPoint;
                const total = bands.reduce((s, [key]) => s + (Number(p[key]) || 0), 0);
                return (
                  <div style={{ background: T.ink, color: "#fff", padding: "7px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    <div style={{ marginBottom: 3 }}>{p.m}</div>
                    {bands.map(([k]) =>
                      mode === "pct" ? (
                        <div key={k}>
                          {k} {pctOf(p, k).toFixed(1)}%
                        </div>
                      ) : (
                        <div key={k}>
                          {k} {usd(Number(p[k]) || 0)}
                        </div>
                      )
                    )}
                    <div style={{ marginTop: 3, paddingTop: 3, borderTop: "1px solid rgba(255,255,255,0.25)", fontWeight: 600 }}>
                      Total {usd(total)}
                    </div>
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
          <span key={k} style={{ fontSize: 11, color: T.ink, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {k}
          </span>
        ))}
        {caption && <span style={{ fontSize: 11, color: T.ink, marginLeft: "auto" }}>{caption}</span>}
      </div>
    </Card>
  );
}
