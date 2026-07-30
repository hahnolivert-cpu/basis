import { BarChart, Bar, XAxis, YAxis, ResponsiveContainer, Tooltip, useXAxisScale, useYAxisScale } from "recharts";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { ETF_DATA } from "@/lib/data";
import { formatTicker } from "@/lib/holdings";
import { Card, Eyebrow } from "@/components/ui";
import type { Holding } from "@/lib/types";

// Display name for a ticker — used for both directly-held positions and ETF
// constituents, so the same company always lands in the same bucket. Keying
// by company name (the old approach) let a direct MSFT position and
// "Microsoft" via VOO/SPHQ diverge into two separate, non-adding bars.
const NAME_FOR_TICKER: Record<string, string> = {
  GOOGL: "Alphabet", AAPL: "Apple", NVDA: "NVIDIA", AMZN: "Amazon", MSTR: "Strategy",
  TTD: "The Trade Desk", BTC: "Bitcoin", ETH: "Ethereum", SOL: "Solana", LINK: "Chainlink", HYPE: "Hyperliquid",
  MSFT: "Microsoft", META: "Meta", AVGO: "Broadcom", TSLA: "Tesla", "BRK.B": "Berkshire Hathaway",
  JPM: "JPMorgan", LLY: "Eli Lilly", MA: "Mastercard", V: "Visa", XOM: "Exxon Mobil", JNJ: "Johnson & Johnson",
  ITUB: "Itaú Unibanco", VALE: "Vale", NU: "Nubank", PBR: "Petrobras", AMX: "América Móvil",
  GMEXICOB: "Grupo México", FMX: "FEMSA", GFNORTEO: "Banorte", BAP: "Credicorp", B3SA3: "B3",
  USTBILL: "U.S. Treasury Bills", NVO: "Novo Nordisk",
  ASML: "ASML Holding", SAP: "SAP", NSRGY: "Nestlé", AZN: "AstraZeneca", SHEL: "Shell",
  LVMUY: "LVMH", RHHBY: "Roche", NVS: "Novartis", HSBC: "HSBC",
  TSM: "Taiwan Semiconductor", TCEHY: "Tencent", BABA: "Alibaba", SSNLF: "Samsung Electronics",
  HDB: "HDFC Bank", INFY: "Infosys", IBN: "ICICI Bank", PDD: "PDD Holdings",
  RIO: "Rio Tinto", BHP: "BHP Group", TTE: "TotalEnergies", VOD: "Vodafone",
  MUFG: "Mitsubishi UFJ", TM: "Toyota", SAN: "Banco Santander", NABZY: "National Australia Bank",
};

type Row = { name: string; direct: number; viaEtf: number; total: number };

// A stacked Bar's own LabelList silently drops the label for any row where
// that specific segment is 0 (e.g. a pure-direct holding has no viaEtf
// value) — recharts positions the label from that segment's own rendered
// rect, and a zero-width rect doesn't get one. That's what made "some rows
// have a label, some don't" — reading the axis scales directly and drawing
// every row's label ourselves sidesteps it entirely.
function ExposureLabels({ rows, netWorth }: { rows: Row[]; netWorth: number }) {
  const xScale = useXAxisScale();
  const yScale = useYAxisScale();
  if (!xScale || !yScale) return null;
  return (
    <g>
      {rows.map((r) => {
        const x = xScale(r.total);
        const y = yScale(r.name, { position: "middle" });
        if (x === undefined || y === undefined) return null;
        return (
          <text key={r.name} x={x + 8} y={y} dominantBaseline="middle" fontFamily={mono} fontSize={10.5} fontWeight={600} fill={T.ink}>
            {((r.total / netWorth) * 100).toFixed(1)}%
          </text>
        );
      })}
    </g>
  );
}

type MaybeFund = Holding & { isEtf?: boolean };

// Normalizes a held symbol to the same ticker convention ETF_DATA's `top`
// lists use, so a direct position matches its ETF-derived counterpart:
// crypto strips provider suffixes ("BTC.USD-PAXOS" -> "BTC"), equities
// uppercase and turn a share-class space into a dot ("BRK B" -> "BRK.B").
function tickerKey(sym: string, cls: string): string {
  if (cls === "Crypto") return sym.split(/[.\-/]/)[0].trim().toUpperCase();
  return sym.trim().toUpperCase().replace(/\s+/g, ".");
}

export function TrueExposureCard({ holdings, netWorth }: { holdings: MaybeFund[]; netWorth: number }) {
  // Funds we hold no constituent weights for cannot be decomposed. Drawing them
  // among the direct positions would imply the look-through covered them.
  const opaqueFunds = holdings.filter((h) => h.isEtf && !h.etf && h.cls !== "Cash");
  const opaqueTotal = opaqueFunds.reduce((s, h) => s + h.value, 0);
  const map: Record<string, { name: string; direct: number; viaEtf: number }> = {};
  const add = (key: string, name: string, kind: "direct" | "viaEtf", v: number) => {
    if (!map[key]) map[key] = { name, direct: 0, viaEtf: 0 };
    map[key][kind] += v;
  };
  for (const h of holdings) {
    if (h.cls === "Cash") continue;
    if (h.isEtf && !h.etf) continue; // counted separately below
    if (h.etf) {
      let used = 0;
      ETF_DATA[h.etf].top.forEach(([ticker, w]) => {
        add(ticker, NAME_FOR_TICKER[ticker] || ticker, "viaEtf", h.value * w);
        used += w;
      });
      if (used < 1) add("__other__", "Other (inside ETFs)", "viaEtf", h.value * (1 - used));
    } else {
      const key = tickerKey(h.sym, h.cls);
      add(key, NAME_FOR_TICKER[key] || formatTicker(h.sym), "direct", h.value);
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
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 46 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={132} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
            <Tooltip
              cursor={{ fill: "rgba(14,91,67,0.06)" }}
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                    {payload[0].payload.name}: {usd(payload[0].payload.total)} ({((payload[0].payload.total / netWorth) * 100).toFixed(1)}% of net worth) = direct{" "}
                    {usd(payload[0].payload.direct)} + via ETFs {usd(payload[0].payload.viaEtf)}
                  </div>
                ) : null
              }
            />
            <Bar dataKey="direct" stackId="x" fill={T.ledger} barSize={15} />
            <Bar dataKey="viaEtf" stackId="x" fill="#9EBEB2" radius={[0, 4, 4, 0]} barSize={15} />
            <ExposureLabels rows={rows} netWorth={netWorth} />
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
        <span style={{ marginLeft: "auto", maxWidth: 460, textAlign: "right" }}>
          Cash excluded; covered ETFs use top-10 weights.
          {opaqueFunds.length > 0 && (
            <>
              {" "}
              <span style={{ color: T.loss }}>
                {usd(opaqueTotal)} across {Array.from(new Set(opaqueFunds.map((h) => h.sym))).join(", ")} is not shown — no
                constituent weights on file, so it cannot be looked through.
              </span>
            </>
          )}
        </span>
      </div>
    </Card>
  );
}
