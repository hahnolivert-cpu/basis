import { useMemo, useState } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono, serif } from "@/lib/theme";
import { sign, usd, usdK } from "@/lib/format";
import { aggregate, mergeBySym, positionsForSegment } from "@/lib/calc";

import { formatTicker } from "@/lib/holdings";
import { toRows } from "@/lib/weekly";
import { useWeeklySnapshots } from "@/lib/hooks/useWeeklySnapshots";
import { Card, Eyebrow, Toggle, Modal } from "@/components/ui";
import { CompositionCard } from "@/components/charts/CompositionCard";
import { SignedBarCard } from "@/components/charts/SignedBarCard";
import { ConcentrationCard } from "@/components/charts/ConcentrationCard";
import { AllocationHistoryCard } from "@/components/charts/AllocationHistoryCard";
import { TrueExposureCard } from "@/components/charts/TrueExposureCard";
import { NetWorthFlowCard } from "@/components/charts/NetWorthFlowCard";
import { CurrencyLensCard } from "@/components/charts/CurrencyLensCard";
import { IncomeHistoryCard } from "@/components/charts/IncomeHistoryCard";
import { DividendCalendarCard } from "@/components/charts/DividendCalendarCard";
import { MonthlyActivityCard } from "@/components/charts/MonthlyActivityCard";
import { useIncome } from "@/lib/hooks/useIncome";
import { useDividendSchedule } from "@/lib/hooks/useDividendSchedule";
import { projectExpectedDividends } from "@/lib/expectedDividends";
import type { Holding } from "@/lib/types";
import type { Liability } from "@/app/api/liabilities/route";

type Drilldown = { title: string; dim: "class" | "sector" | "geo"; keys: string[] };

export function NetWorthTab({
  holdings,
  debts,
  liabilities,
  lookThrough,
  setLookThrough,
}: {
  holdings: Holding[];
  debts: number;
  liabilities: Liability[];
  lookThrough: boolean;
  setLookThrough: (v: boolean) => void;
}) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const capital = holdings.filter((h) => h.pf === "capital").reduce((s, h) => s + h.value, 0);
  const personal = total - capital;

  // Real per-symbol annual dividend income where Polygon's published record
  // (or, failing that, our own payment-cadence inference) covers it — the
  // same data the dividend calendar projects from — instead of the flatter
  // value x trailing-yield estimate, which the calendar rebuild showed
  // understates or overstates irregular payers like BIDD. Cash-sweep
  // "yield" (Treasury, IBKR cash interest) isn't a dividend at all, so it
  // has no entry here and correctly falls back to the yield-based estimate.
  const { data: incomeData } = useIncome();
  const { data: scheduleData } = useDividendSchedule();
  const annualDividendBySymbol = useMemo(() => {
    const projection = projectExpectedDividends(holdings, incomeData?.transactions ?? [], scheduleData?.schedule ?? []);
    const map = new Map<string, number>();
    for (const month of projection) {
      for (const c of month.bySymbol) map.set(c.symbol, (map.get(c.symbol) ?? 0) + c.amountCents);
    }
    return map;
  }, [holdings, incomeData, scheduleData]);
  const estAnnualIncome = (h: Holding) => {
    const real = annualDividendBySymbol.get(h.sym);
    return real !== undefined ? real / 100 : (h.value * h.yld) / 100;
  };
  const income = mergeBySym(holdings).reduce((s, h) => s + estAnnualIncome(h), 0);

  // Each composition chart gets its own Crypto/Cash include toggles rather
  // than one global control — Asset Class and Geography default to showing
  // both (they're meaningful buckets there), Sector defaults to excluding
  // both (neither has a real GICS sector).
  const filterHoldings = (rows: Holding[], includeCrypto: boolean, includeCash: boolean) =>
    rows.filter((h) => (includeCrypto || h.cls !== "Crypto") && (includeCash || h.cls !== "Cash"));

  const [classIncludeCrypto, setClassIncludeCrypto] = useState(true);
  const [classIncludeCash, setClassIncludeCash] = useState(true);
  const classHoldings = filterHoldings(holdings, classIncludeCrypto, classIncludeCash);
  const classTotal = classHoldings.reduce((s, h) => s + h.value, 0);
  const byClass = aggregate(classHoldings, "class", false);

  const [sectorIncludeCrypto, setSectorIncludeCrypto] = useState(false);
  const [sectorIncludeCash, setSectorIncludeCash] = useState(false);
  const sectorHoldings = filterHoldings(holdings, sectorIncludeCrypto, sectorIncludeCash);
  const sectorTotal = sectorHoldings.reduce((s, h) => s + h.value, 0);
  const bySector = aggregate(sectorHoldings, "sector", lookThrough);

  const [geoIncludeCrypto, setGeoIncludeCrypto] = useState(true);
  const [geoIncludeCash, setGeoIncludeCash] = useState(true);
  const geoHoldings = filterHoldings(holdings, geoIncludeCrypto, geoIncludeCash);
  const geoTotal = geoHoldings.reduce((s, h) => s + h.value, 0);
  const byGeo = aggregate(geoHoldings, "geo", lookThrough);

  const [concIncludeCrypto, setConcIncludeCrypto] = useState(true);
  const [concIncludeCash, setConcIncludeCash] = useState(true);
  const concHoldings = filterHoldings(holdings, concIncludeCrypto, concIncludeCash);
  const concTotal = concHoldings.reduce((s, h) => s + h.value, 0);
  // Merged by symbol first — otherwise a position split across two accounts
  // (e.g. STRC at both IBKR and Robinhood) shows up as two separate rows.
  const incomeRows = mergeBySym(holdings)
    .map((h) => ({ ...h, inc: estAnnualIncome(h) }))
    .filter((h) => h.inc > 0)
    .sort((a, b) => b.inc - a.inc);
  const startNW = total - debts;
  const [drilldown, setDrilldown] = useState<Drilldown | null>(null);
  const openDrilldown = (title: string, dim: Drilldown["dim"]) => (name: string, foldedNames: string[]) =>
    setDrilldown({ title: `${title} · ${name}`, dim, keys: foldedNames });
  const drilldownHoldings =
    drilldown?.dim === "geo" ? geoHoldings : drilldown?.dim === "sector" ? sectorHoldings : drilldown?.dim === "class" ? classHoldings : holdings;
  const drilldownRows = drilldown ? positionsForSegment(drilldownHoldings, drilldown.dim, drilldown.keys, lookThrough) : [];
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
        <Card style={{ flex: 1.4, minWidth: "min(300px, 100%)" }}>
          <Eyebrow>Where the wealth sits</Eyebrow>
          <div style={{ display: "flex", height: 22, borderRadius: 6, overflow: "hidden", marginBottom: 14 }}>
            <div style={{ width: `${(capital / total) * 100}%`, background: T.gain }} />
            <div style={{ width: `${(personal / total) * 100}%`, background: T.ink }} />
          </div>
          {(
            [
              ["976 Capital", capital, T.gain],
              ["Personal", personal, T.ink],
            ] as [string, number, string][]
          ).map(([n, v, c]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{n}
              </span>
              <span style={{ fontFamily: mono }}>{usd(v)} <span style={{ color: T.ink }}>· {((v / total) * 100).toFixed(1)}%</span></span>
            </div>
          ))}
          {liabilities.length > 0 &&
            liabilities.map((l) => (
              <div key={l.id} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 12, color: T.ink }}>
                <span>{l.name}</span>
                <span style={{ fontFamily: mono, color: T.loss }}>−{usd(l.amount_cents / 100).slice(1)}</span>
              </div>
            ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", fontSize: 13.5, color: T.loss, fontWeight: liabilities.length > 1 ? 600 : 400 }}>
            <span>Debts</span><span style={{ fontFamily: mono }}>−{usd(debts).slice(1)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0 0", fontSize: 14, fontWeight: 600 }}>
            <span>Net worth</span><span style={{ fontFamily: mono }}>{usd(total - debts)}</span>
          </div>
        </Card>

        {/* Estimated income */}
        <Card style={{ flex: 1, minWidth: "min(280px, 100%)" }}>
          <Eyebrow>Est. dividends &amp; interest</Eyebrow>
          <div style={{ fontFamily: serif, fontSize: "clamp(24px, 6.5vw, 34px)", fontWeight: 600 }}>{usd(income)}<span style={{ fontSize: 15, color: T.ink, fontFamily: "inherit" }}> / yr</span></div>
          <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono, marginTop: 2, marginBottom: 12 }}>≈ {usd(income / 12)} / mo · {((income / total) * 100).toFixed(2)}% blended yield</div>
          {incomeRows.slice(0, 10).map((h) => (
            <div key={h.sym + h.acct} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "8px 0", borderBottom: `1px solid ${T.line}` }}>
              <span>{h.sym} <span style={{ color: T.ink, fontFamily: mono, fontSize: 11 }}>{h.yld.toFixed(2)}%</span></span>
              <span style={{ fontFamily: mono }}>{usd(h.inc)}</span>
            </div>
          ))}
          {incomeRows.length > 10 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "8px 0", color: T.ink }}>
              <span>+ {incomeRows.length - 10} more</span>
              <span style={{ fontFamily: mono }}>{usd(incomeRows.slice(10).reduce((s, h) => s + h.inc, 0))}</span>
            </div>
          )}
        </Card>
      </div>

      <NetWorthFlowCard holdings={holdings} debts={debts} />

      {/* Net worth evolution — real weekly closes */}
      <Card style={{ marginTop: 16 }}>
        <Eyebrow>Net worth evolution · {weeklyRows.length} weeks</Eyebrow>
        {weeklyRows.length === 0 ? (
          <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>
            Awaiting weekly history — see the Tracking tab.
          </div>
        ) : (
          <div style={{ height: 220 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={weeklyRows} margin={{ left: 8, right: 8, top: 6 }}>
                <defs>
                  <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.gain} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={T.gain} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={T.line} vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval="preserveStartEnd" />
                <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={52} domain={["dataMin - 60000", "dataMax + 40000"]} />
                <Tooltip
                  content={({ active, payload }) =>
                    active && payload?.length ? (
                      <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                        {payload[0].payload.date}: {usd(payload[0].payload.total)}
                      </div>
                    ) : null
                  }
                />
                <Area type="monotone" dataKey="total" stroke={T.gain} strokeWidth={2} fill="url(#nw)" />
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
        <CompositionCard
          title="Asset class"
          data={byClass}
          total={classTotal}
          donut
          onSegmentClick={openDrilldown("Asset class", "class")}
          headerRight={
            <div style={{ display: "flex", gap: 6 }}>
              <Toggle on={classIncludeCrypto} setOn={setClassIncludeCrypto} label="Crypto" />
              <Toggle on={classIncludeCash} setOn={setClassIncludeCash} label="Cash" />
            </div>
          }
        />
        <CompositionCard
          title="Sector — true exposure"
          data={bySector}
          total={sectorTotal}
          onSegmentClick={openDrilldown("Sector", "sector")}
          headerRight={
            <div style={{ display: "flex", gap: 6 }}>
              <Toggle on={sectorIncludeCrypto} setOn={setSectorIncludeCrypto} label="Crypto" />
              <Toggle on={sectorIncludeCash} setOn={setSectorIncludeCash} label="Cash" />
            </div>
          }
        />
        <CompositionCard
          title="Geography — true exposure"
          data={byGeo}
          total={geoTotal}
          minPct={3}
          onSegmentClick={openDrilldown("Geography", "geo")}
          headerRight={
            <div style={{ display: "flex", gap: 6 }}>
              <Toggle on={geoIncludeCrypto} setOn={setGeoIncludeCrypto} label="Crypto" />
              <Toggle on={geoIncludeCash} setOn={setGeoIncludeCash} label="Cash" />
            </div>
          }
        />
      </div>
      <TrueExposureCard holdings={holdings} netWorth={startNW} />

      {/* Analytics */}
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginTop: 30, marginBottom: 14 }}>Analytics</div>
      <ConcentrationCard
        holdings={concHoldings}
        total={concTotal}
        headerRight={
          <div style={{ display: "flex", gap: 6 }}>
            <Toggle on={concIncludeCrypto} setOn={setConcIncludeCrypto} label="Crypto" />
            <Toggle on={concIncludeCash} setOn={setConcIncludeCash} label="Cash" />
          </div>
        }
      />
      <div style={{ marginTop: 16 }}>
        <SignedBarCard
          title="Day change attribution · top movers"
          rows={(() => {
            const ranked = mergeBySym(holdings)
              .map((h) => ({ name: formatTicker(h.sym), v: Math.round((h.value * h.day) / 100), pct: h.day }))
              .filter((d) => d.v !== 0)
              .sort((a, b) => b.v - a.v);
            return ranked.length <= 12 ? ranked : [...ranked.slice(0, 6), ...ranked.slice(-6)];
          })()}
          fmtV={(v) => sign(v, usd(v))}
        />
      </div>
      {weeklyRows.length > 0 && <AllocationHistoryCard rows={weeklyRows} />}

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <IncomeHistoryCard />
        <DividendCalendarCard holdings={holdings} />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <MonthlyActivityCard />
      </div>

      {drilldown && (
        <Modal title={drilldown.title} onClose={() => setDrilldown(null)}>
          {drilldownRows.length === 0 ? (
            <div style={{ fontSize: 13, color: T.ink }}>No positions found.</div>
          ) : (
            drilldownRows.map((p, i) => (
              <div
                key={`${p.sym}-${p.via ?? ""}-${i}`}
                style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13 }}
              >
                <span>
                  <span style={{ fontWeight: 600 }}>{p.sym}</span>
                  <span style={{ color: T.ink, fontSize: 11.5, marginLeft: 8 }}>
                    {p.name}
                    {p.via ? ` · via ${p.via}` : ""}
                  </span>
                </span>
                <span style={{ fontFamily: mono }}>{usd(p.value)}</span>
              </div>
            ))
          )}
        </Modal>
      )}
    </div>
  );
}
