import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono, serif } from "@/lib/theme";
import { sign, usd, usdK } from "@/lib/format";
import { aggregate, mergeBySym, LIQ_TIER } from "@/lib/calc";

import { toRows } from "@/lib/weekly";
import { useWeeklySnapshots } from "@/lib/hooks/useWeeklySnapshots";
import { Card, Eyebrow, Toggle } from "@/components/ui";
import { CompositionCard } from "@/components/charts/CompositionCard";
import { SignedBarCard } from "@/components/charts/SignedBarCard";
import { ConcentrationCard } from "@/components/charts/ConcentrationCard";
import { AllocationHistoryCard } from "@/components/charts/AllocationHistoryCard";
import { TrueExposureCard } from "@/components/charts/TrueExposureCard";
import { CurrencyLensCard } from "@/components/charts/CurrencyLensCard";
import type { Holding } from "@/lib/types";

export function NetWorthTab({
  holdings,
  debts,
  lookThrough,
  setLookThrough,
}: {
  holdings: Holding[];
  debts: number;
  lookThrough: boolean;
  setLookThrough: (v: boolean) => void;
}) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const capital = holdings.filter((h) => h.pf === "capital").reduce((s, h) => s + h.value, 0);
  const personal = total - capital;
  const income = holdings.reduce((s, h) => s + (h.value * h.yld) / 100, 0);
  const byClass = aggregate(holdings, "class", false);
  const bySector = aggregate(holdings, "sector", lookThrough);
  const byGeo = aggregate(holdings, "geo", lookThrough);
  const incomeRows = holdings
    .filter((h) => h.yld > 0)
    .map((h) => ({ ...h, inc: (h.value * h.yld) / 100 }))
    .sort((a, b) => b.inc - a.inc);
  const startNW = total - debts;
  // IBKR reports the Paxos crypto as "BTC.USD-PAXOS"; match either dialect.
  const btcHolding = holdings.find((h) => h.sym.split(/[.\-/]/)[0].toUpperCase() === "BTC");
  const btcPx = btcHolding?.qty ? btcHolding.value / btcHolding.qty : 63817;

  // Real weekly history from weekly_snapshots — the evolution and allocation
  // charts were previously drawn from mock arrays in lib/data.ts.
  const { data: weekly } = useWeeklySnapshots();
  const weeklyRows = useMemo(() => toRows(weekly?.snapshots ?? []), [weekly]);

  return (
    <div>
      {/* Entity split */}
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 22 }}>
        <Card style={{ flex: 1.4, minWidth: 300 }}>
          <Eyebrow>Where the wealth sits</Eyebrow>
          <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ width: `${(capital / total) * 100}%`, background: T.ledger }} />
            <div style={{ width: `${(personal / total) * 100}%`, background: "#C09A5B" }} />
          </div>
          {(
            [
              ["976 Capital", capital, T.ledger],
              ["Personal", personal, "#C09A5B"],
            ] as [string, number, string][]
          ).map(([n, v, c]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{n}
              </span>
              <span style={{ fontFamily: mono }}>{usd(v)} <span style={{ color: T.inkSoft }}>· {((v / total) * 100).toFixed(1)}%</span></span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13.5, color: T.loss }}>
            <span>Debts</span><span style={{ fontFamily: mono }}>−{usd(debts).slice(1)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0 0", fontSize: 14, fontWeight: 600 }}>
            <span>Net worth</span><span style={{ fontFamily: mono }}>{usd(total - debts)}</span>
          </div>
        </Card>

        {/* Estimated income */}
        <Card style={{ flex: 1, minWidth: 280 }}>
          <Eyebrow>Est. dividends &amp; interest</Eyebrow>
          <div style={{ fontFamily: serif, fontSize: 34, fontWeight: 600 }}>{usd(income)}<span style={{ fontSize: 15, color: T.inkSoft, fontFamily: "inherit" }}> / yr</span></div>
          <div style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: mono, marginTop: 2, marginBottom: 12 }}>≈ {usd(income / 12)} / mo · {((income / total) * 100).toFixed(2)}% blended yield</div>
          {incomeRows.slice(0, 5).map((h) => (
            <div key={h.sym + h.acct} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "5px 0", borderBottom: `1px solid ${T.line}` }}>
              <span>{h.sym} <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 11 }}>{h.yld}%</span></span>
              <span style={{ fontFamily: mono }}>{usd(h.inc)}</span>
            </div>
          ))}
        </Card>
      </div>

      {/* Net worth evolution — real weekly closes */}
      <Card style={{ marginTop: 16 }}>
        <Eyebrow>Net worth evolution · {weeklyRows.length} weeks</Eyebrow>
        {weeklyRows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: T.inkSoft, fontFamily: mono }}>
            Awaiting weekly history — see the Tracking tab.
          </div>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyRows} margin={{ left: 8, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.ledger} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={T.ledger} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.line} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={6} />
                <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} width={52} domain={["dataMin - 60000", "dataMax + 40000"]} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                        {payload[0].payload.date}: {usd(payload[0].payload.total)}
                      </div>
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="total" stroke={T.ledger} strokeWidth={2} fill="url(#nw)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>
      <CurrencyLensCard startNW={startNW} btcPx={btcPx} />

      {/* Composition */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginTop: 30, marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600 }}>Composition</div>
        <Toggle on={lookThrough} setOn={setLookThrough} label="Look through ETFs" />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <CompositionCard title="Asset class" data={byClass} total={total} donut />
        <CompositionCard title="Sector — true exposure" data={bySector} total={total} />
        <CompositionCard title="Geography — true exposure" data={byGeo} total={total} />
      </div>
      <TrueExposureCard holdings={holdings} />

      {/* Analytics */}
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginTop: 30, marginBottom: 14 }}>Analytics</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <ConcentrationCard holdings={holdings} total={total} />
        <SignedBarCard
          title="Day change attribution · top movers"
          rows={mergeBySym(holdings)
            .map((h) => ({ name: h.sym, v: Math.round((h.value * h.day) / 100) }))
            .filter((d) => d.v !== 0)
            .sort((a, b) => Math.abs(b.v) - Math.abs(a.v))
            .slice(0, 7)}
          fmtV={(v) => sign(v, usd(v))}
          note="Which positions actually moved the number today."
        />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <CompositionCard
          title="Liquidity tiers"
          data={(() => {
            const m: Record<string, number> = {};
            holdings.forEach((h) => { const k = LIQ_TIER(h); m[k] = (m[k] || 0) + h.value; });
            return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
          })()}
          total={total}
          donut
        />
        <SignedBarCard
          title="Unrealized gain/loss ladder · %"
          rows={mergeBySym(holdings)
            .filter((h) => h.cls !== "Cash")
            .map((h) => ({ name: h.sym, v: +(((h.value - h.cost) / h.cost) * 100).toFixed(1) }))
            .sort((a, b) => b.v - a.v)}
          fmtV={(v) => sign(v, v + "%")}
          note="Bottom of the ladder doubles as a tax-loss-harvesting shortlist."
        />
      </div>
      {weeklyRows.length > 0 && <AllocationHistoryCard rows={weeklyRows} />}
    </div>
  );
}
