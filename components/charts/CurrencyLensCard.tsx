import { LineChart, Line, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono } from "@/lib/theme";
import { fmt, usd } from "@/lib/format";
import { NW_HISTORY, EURUSD_HIST, BTCUSD_HIST } from "@/lib/data";
import { Card, Eyebrow } from "@/components/ui";

const LINES: [string, string][] = [
  ["USD", T.ledger],
  ["EUR", "#2F4858"],
  ["BTC", "#C09A5B"],
];

export function CurrencyLensCard({ startNW, btcPx }: { startNW: number; btcPx: number }) {
  const data = NW_HISTORY.map((p, i) => ({
    m: p.m,
    USD: +((p.v / NW_HISTORY[0].v) * 100).toFixed(1),
    EUR: +((p.v / EURUSD_HIST[i] / (NW_HISTORY[0].v / EURUSD_HIST[0])) * 100).toFixed(1),
    BTC: +((p.v / BTCUSD_HIST[i] / (NW_HISTORY[0].v / BTCUSD_HIST[0])) * 100).toFixed(1),
  }));
  const eurNow = startNW / EURUSD_HIST[EURUSD_HIST.length - 1];
  const btcNow = startNW / btcPx;

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow style={{ marginBottom: 0 }}>Net worth through three lenses · indexed to 100</Eyebrow>
        <div style={{ fontFamily: mono, fontSize: 12.5, color: T.inkSoft }}>
          {usd(startNW)} · €{fmt(eurNow)} · ₿{btcNow.toFixed(2)}
        </div>
      </div>
      <div style={{ height: 220, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ left: 8, right: 8, top: 6 }}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={2} />
            <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} width={40} domain={["auto", "auto"]} />
            <Tooltip
              formatter={(v, n) => [v, n]}
              contentStyle={{ background: T.ink, border: "none", borderRadius: 6, fontFamily: mono, fontSize: 12 }}
              labelStyle={{ color: "#fff" }}
              itemStyle={{ color: "#fff" }}
            />
            {LINES.map(([k, c]) => (
              <Line key={k} type="monotone" dataKey={k} stroke={c} strokeWidth={k === "USD" ? 2.5 : 1.8} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 11, color: T.inkSoft, fontFamily: mono, flexWrap: "wrap" }}>
        {LINES.map(([k, c]) => (
          <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 12, height: 3, borderRadius: 2, background: c }} />{k}-denominated
          </span>
        ))}
        <span style={{ marginLeft: "auto" }}>Same wealth, three yardsticks — growth in BTC terms means you outgrew bitcoin itself.</span>
      </div>
    </Card>
  );
}
