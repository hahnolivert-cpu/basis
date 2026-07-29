import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { ETF_DATA } from "@/lib/data";
import { Card, Eyebrow } from "@/components/ui";
import type { Holding } from "@/lib/types";

// Direct-holding symbols shown by company name instead of ticker, matching
// the names ETF constituent lists use.
const DIRECT_NAME: Record<string, string> = {
  GOOGL: "Alphabet", AAPL: "Apple", NVDA: "NVIDIA", AMZN: "Amazon", MSTR: "Strategy",
  TTD: "The Trade Desk", BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", LINK: "Chainlink", HYPE: "Hyperliquid",
};

type Row = { name: string; direct: number; viaEtf: number; total: number };

export function TrueExposureCard({ holdings }: { holdings: Holding[] }) {
  const map: Record<string, { name: string; direct: number; viaEtf: number }> = {};
  const add = (name: string, key: "direct" | "viaEtf", v: number) => {
    if (!map[name]) map[name] = { name, direct: 0, viaEtf: 0 };
    map[name][key] += v;
  };
  for (const h of holdings) {
    if (h.cls === "Cash") continue;
    if (h.etf) {
      let used = 0;
      ETF_DATA[h.etf].top.forEach(([n, w]) => {
        add(n, "viaEtf", h.value * w);
        used += w;
      });
      if (used < 1) add("Other (inside ETFs)", "viaEtf", h.value * (1 - used));
    } else {
      add(DIRECT_NAME[h.sym] || h.sym, "direct", h.value);
    }
  }
  const rows: Row[] = Object.values(map)
    .map((r) => ({ ...r, total: Math.round(r.direct + r.viaEtf) }))
    .filter((r) => r.name !== "Other (inside ETFs)")
    .sort((a, b) => b.total - a.total)
    .slice(0, 10);

  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>True exposure by asset · direct + inside ETFs</Eyebrow>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 14 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
            <Tooltip
              cursor={{ fill: "rgba(14,91,67,0.06)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    {payload[0].payload.name}: {usd(payload[0].payload.total)} = direct {usd(payload[0].payload.direct)} + via ETFs {usd(payload[0].payload.viaEtf)}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="direct" stackId="x" fill={T.ledger} barSize={15} />
            <Bar dataKey="viaEtf" stackId="x" fill="#9EBEB2" radius={[0, 4, 4, 0]} barSize={15} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 11, color: T.inkSoft, fontFamily: mono, flexWrap: "wrap" }}>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: T.ledger }} />Held directly
        </span>
        <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
          <span style={{ width: 8, height: 8, borderRadius: 2, background: "#9EBEB2" }} />Via ETF holdings
        </span>
        <span style={{ marginLeft: "auto" }}>Cash accounts excluded; ETF weights are top-10 approximations.</span>
      </div>
    </Card>
  );
}
