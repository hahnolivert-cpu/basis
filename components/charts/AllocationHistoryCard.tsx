import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono } from "@/lib/theme";
import type { WeeklyRow } from "@/lib/weekly";
import { Card, Eyebrow } from "@/components/ui";

const BANDS: [keyof Pick<WeeklyRow, "crypto" | "equities" | "cash">, string, string][] = [
  ["crypto", "Crypto", "#C09A5B"],
  ["equities", "Equities", T.gain],
  ["cash", "Cash", "#6E9D8D"],
];

const pctOf = (r: WeeklyRow, k: "crypto" | "equities" | "cash") => (r.total ? (r[k] / r.total) * 100 : 0);

export function AllocationHistoryCard({ rows }: { rows: WeeklyRow[] }) {
  const first = rows[0];
  const last = rows.at(-1);

  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Allocation over time · % of assets</Eyebrow>
      <div style={{ height: 260 }}>
        <ResponsiveContainer width="100%" height="100%">
          {/* stackOffset="expand" normalises each week to 1.0, giving a true
              100% stacked band chart regardless of how the total moved. */}
          <AreaChart data={rows} stackOffset="expand" margin={{ left: 8, right: 8, top: 6 }}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval="preserveStartEnd" />
            <YAxis
              tickFormatter={(v: number) => `${Math.round(v * 100)}%`}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }}
              width={44}
            />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const r = payload[0].payload as WeeklyRow;
                return (
                  <div style={{ background: T.tooltipBg, color: "#fff", padding: "7px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    <div style={{ marginBottom: 3 }}>{r.date}</div>
                    {BANDS.map(([k, label]) => (
                      <div key={k}>
                        {label} {pctOf(r, k).toFixed(1)}%
                      </div>
                    ))}
                  </div>
                );
              }}
            />
            {BANDS.map(([k, , color]) => (
              <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={color} fill={color} fillOpacity={0.62} strokeWidth={1.4} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap", alignItems: "baseline" }}>
        {BANDS.map(([, label, color]) => (
          <span key={label} style={{ fontSize: 11, color: T.ink, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: color }} />
            {label}
          </span>
        ))}
        {first && last && (
          <span style={{ fontSize: 11, color: T.ink, marginLeft: "auto" }}>
            Crypto {pctOf(first, "crypto").toFixed(0)}% → {pctOf(last, "crypto").toFixed(0)}% since {first.label} — concentration traded for balance.
          </span>
        )}
      </div>
    </Card>
  );
}
