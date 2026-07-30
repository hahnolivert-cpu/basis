import { LineChart, Line, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono } from "@/lib/theme";
import { fmt, usd } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";
import { useWeeklySnapshots } from "@/lib/hooks/useWeeklySnapshots";
import { monthLabel } from "@/lib/weekly";

const LINES: [string, string][] = [
  ["USD", T.ledger],
  ["EUR", "#2F4858"],
  ["BTC", "#C09A5B"],
];

export function CurrencyLensCard({ startNW, btcPx }: { startNW: number; btcPx: number }) {
  const { data: weekly } = useWeeklySnapshots();
  const snapshots = weekly?.snapshots ?? [];

  // Each series is indexed to 100 at the first week, so the lines answer
  // "how has wealth grown measured in this unit" rather than tracking the
  // unit's own price. Rates are the real weekly closes from weekly_snapshots
  // (usd_to_eur is EUR per USD, so EUR value multiplies).
  const base = snapshots[0];
  const data = snapshots.map((s) => {
    const usdVal = s.total_cents / 100;
    const baseUsd = base.total_cents / 100;
    return {
      m: monthLabel(s.sunday_date),
      date: s.sunday_date,
      USD: +((usdVal / baseUsd) * 100).toFixed(1),
      EUR: +(((usdVal * s.usd_to_eur) / (baseUsd * base.usd_to_eur)) * 100).toFixed(1),
      BTC: +((usdVal / s.btc_price_usd / (baseUsd / base.btc_price_usd)) * 100).toFixed(1),
    };
  });

  // Chips show today's live position; the latest recorded weekly rate is the
  // best available EURUSD until Finnhub forex is on a plan that returns it.
  const latestRate = snapshots.at(-1)?.usd_to_eur;
  const eurNow = latestRate ? startNW * latestRate : null;
  const btcNow = startNW / btcPx;

  return (
    <Card style={{ marginTop: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <Eyebrow style={{ marginBottom: 0 }}>Net worth through three lenses · indexed to 100</Eyebrow>
        <div style={{ fontFamily: mono, fontSize: 12.5, color: T.ink }}>
          {usd(startNW)}
          {eurNow !== null && <> · €{fmt(eurNow)}</>} · ₿{btcNow.toFixed(2)}
        </div>
      </div>
      {data.length === 0 ? (
        <div style={{ fontSize: 12.5, color: T.ink, marginTop: 12, fontFamily: mono }}>
          Awaiting weekly history — see the Tracking tab.
        </div>
      ) : (
        <>
          <div style={{ height: 220, marginTop: 12 }}>
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ left: 8, right: 8, top: 6 }}>
                <CartesianGrid stroke={T.line} vertical={false} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval={6} />
                <YAxis tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={40} domain={["auto", "auto"]} />
                <Tooltip
                  formatter={(v, n) => [v, n]}
                  labelFormatter={(_, p) => p?.[0]?.payload?.date ?? ""}
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
          <div style={{ marginTop: 8, display: "flex", gap: 16, fontSize: 11, color: T.ink, fontFamily: mono, flexWrap: "wrap" }}>
            {LINES.map(([k, c]) => (
              <span key={k} style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                <span style={{ width: 12, height: 3, borderRadius: 2, background: c }} />{k}-denominated
              </span>
            ))}
            <span style={{ marginLeft: "auto" }}>Same wealth, three yardsticks — growth in BTC terms means you outgrew bitcoin itself.</span>
          </div>
        </>
      )}
    </Card>
  );
}
