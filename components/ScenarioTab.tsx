"use client";

import { useMemo } from "react";
import { AreaChart, Area, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis } from "recharts";
import { T, mono, serif } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { fvWithLumpSums, reqMonthly, reqReturn, subclass } from "@/lib/calc";
import { Card } from "@/components/ui";
import { ChartTip } from "@/components/charts/ChartTip";
import { CompositionForecastCard, type CompositionPoint } from "@/components/charts/CompositionForecastCard";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import type { Holding } from "@/lib/types";

const TARGETS = [3e6, 5e6, 10e6, 20e6];
const YEARS = [2030, 2035, 2040, 2045, 2050];
const monthsTo = (year: number) => (year - 2026) * 12 + 5; // Jul 2026 → Dec of year

// Bucket order doubles as stack order (bottom to top) in the forecast chart.
const BUCKETS = ["Crypto", "Stocks", "ETFs", "Cash"] as const;
type Bucket = (typeof BUCKETS)[number];
const BUCKET_COLOR: Record<Bucket, string> = { Crypto: "#C09A5B", Stocks: T.gain, ETFs: "#6E9D8D", Cash: "#2F4858" };

// Every input on this tab is remembered across visits (localStorage) — it's
// a planning worksheet, not a one-off calculator, so re-typing the same
// assumptions on every reload would be pure friction.
export function ScenarioTab({ startNW, holdings = [] }: { startNW: number; holdings?: Holding[] }) {
  const [mode, setMode] = usePersistedState<"monthly" | "return">("basis:scenario:mode", "monthly");
  const [assumedReturn, setAssumedReturn] = usePersistedState("basis:scenario:assumedReturn", 7);
  const [assumedMonthly, setAssumedMonthly] = usePersistedState("basis:scenario:assumedMonthly", 5000);
  const [planMonthly, setPlanMonthly] = usePersistedState("basis:scenario:planMonthly", 5000);
  const [planReturn, setPlanReturn] = usePersistedState("basis:scenario:planReturn", 7);
  const [oneTimePayments, setOneTimePayments] = usePersistedState<{ id: string; label: string; amount: number; year: number }[]>(
    "basis:scenario:oneTimePayments",
    []
  );
  const addPayment = () =>
    setOneTimePayments((ps) => [...ps, { id: crypto.randomUUID(), label: "Bonus", amount: 10000, year: new Date().getFullYear() }]);
  const updatePayment = (id: string, patch: Partial<{ label: string; amount: number; year: number }>) =>
    setOneTimePayments((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const removePayment = (id: string) => setOneTimePayments((ps) => ps.filter((p) => p.id !== id));

  // "Status quo" starting point for the composition forecast — today's actual
  // holdings, bucketed the same way the Asset Class chart on the Net Worth
  // tab does (subclass splits Equities into Stocks vs ETFs).
  const statusQuo = useMemo(() => {
    const totals: Record<Bucket, number> = { Crypto: 0, Stocks: 0, ETFs: 0, Cash: 0 };
    for (const h of holdings) {
      const b = subclass(h) as Bucket;
      totals[b] = (totals[b] ?? 0) + h.value;
    }
    return totals;
  }, [holdings]);

  const [monthlyByBucket, setMonthlyByBucket] = usePersistedState<Record<Bucket, number>>(
    "basis:scenario:monthlyByBucket",
    { Crypto: 500, Stocks: 1000, ETFs: 1500, Cash: 200 }
  );
  const [returnByBucket, setReturnByBucket] = usePersistedState<Record<Bucket, number>>(
    "basis:scenario:returnByBucket",
    { Crypto: 15, Stocks: 8, ETFs: 7, Cash: 4 }
  );

  const compositionForecast = useMemo(() => {
    const bal: Record<Bucket, number> = { ...statusQuo };
    const points: CompositionPoint[] = [];
    let month = 0;
    for (const y of [2026, ...YEARS]) {
      const target = monthsTo(y);
      while (month < target) {
        for (const k of BUCKETS) bal[k] = bal[k] * (1 + returnByBucket[k] / 100 / 12) + (monthlyByBucket[k] || 0);
        month++;
      }
      const point: CompositionPoint = { m: String(y) };
      for (const k of BUCKETS) point[k] = Math.round(bal[k]);
      points.push(point);
    }
    return points;
  }, [statusQuo, monthlyByBucket, returnByBucket]);

  const lumpSums = useMemo(
    () => oneTimePayments.map((p) => ({ month: monthsTo(p.year), amount: p.amount })),
    [oneTimePayments]
  );

  const projection = useMemo(() => {
    const pts = [];
    for (let y = 2026; y <= 2050; y++) {
      pts.push({ m: String(y), v: Math.round(fvWithLumpSums(startNW, planMonthly, planReturn / 100, Math.max(0, monthsTo(y)), lumpSums)) });
    }
    return pts;
  }, [startNW, planMonthly, planReturn, lumpSums]);

  const inputStyle = { fontFamily: mono, fontSize: 14, padding: "8px 10px", border: `1px solid ${T.line}`, borderRadius: 8, width: 110, background: T.card, color: T.ink };
  const th = { padding: "10px 12px", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: T.ink, textAlign: "right" as const, borderBottom: `1px solid ${T.line}` };
  const td = { padding: "10px 12px", fontFamily: mono, fontSize: 13, textAlign: "right" as const, borderBottom: `1px solid ${T.line}` };

  return (
    <div>
      {/* ---- Section 1: What it takes ---- */}
      <Card style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }}>What it takes</div>
            <div style={{ fontSize: 12.5, color: T.ink, marginTop: 3 }}>Starting from today&apos;s {usd(startNW)} net worth, monthly compounding.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
              {(
                [
                  ["monthly", "Solve $/mo"],
                  ["return", "Solve return"],
                ] as [typeof mode, string][]
              ).map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setMode(id)}
                  style={{
                    border: "none", cursor: "pointer", padding: "8px 13px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500,
                    background: mode === id ? T.gain : T.card, color: mode === id ? "#fff" : T.ink,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
            {mode === "monthly" ? (
              <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 7 }}>
                at return <input type="number" value={assumedReturn} min={0} max={30} step={0.5} onChange={(e) => setAssumedReturn(+e.target.value)} style={{ ...inputStyle, width: 70 }} /> %/yr
              </label>
            ) : (
              <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 7 }}>
                investing $<input type="number" value={assumedMonthly} min={0} step={500} onChange={(e) => setAssumedMonthly(+e.target.value)} style={inputStyle} /> /mo
              </label>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 640 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Target</th>
                {YEARS.map((y) => <th key={y} style={th}>by {y}</th>)}
              </tr>
            </thead>
            <tbody>
              {TARGETS.map((t) => (
                <tr key={t}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, fontFamily: "inherit" }}>{usdK(t)}</td>
                  {YEARS.map((y) => {
                    const m = monthsTo(y);
                    if (mode === "monthly") {
                      const need = reqMonthly(t, startNW, assumedReturn / 100, m);
                      return (
                        <td key={y} style={td}>
                          {need <= 0 ? <span style={{ color: T.gain }}>on track ✓</span> : need > 200000 ? <span style={{ color: T.loss }}>&gt;$200k/mo</span> : `${usd(need)}/mo`}
                        </td>
                      );
                    }
                    const r = reqReturn(t, startNW, assumedMonthly, m);
                    return (
                      <td key={y} style={td}>
                        {r === null ? <span style={{ color: T.loss }}>&gt;60%/yr</span> : r === 0 ? <span style={{ color: T.gain }}>on track ✓</span> : `${(r * 100).toFixed(1)}%/yr`}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* ---- Section 2: Project my plan ---- */}
      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }}>Project my plan</div>
            <div style={{ fontSize: 12.5, color: T.ink, marginTop: 3 }}>Enter your plan; see where it lands.</div>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 7 }}>
              $<input type="number" value={planMonthly} min={0} step={500} onChange={(e) => setPlanMonthly(+e.target.value)} style={inputStyle} /> /mo
            </label>
            <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <input type="number" value={planReturn} min={-10} max={30} step={0.5} onChange={(e) => setPlanReturn(+e.target.value)} style={{ ...inputStyle, width: 70 }} /> %/yr
            </label>
          </div>
        </div>

        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.ink, marginBottom: 8 }}>
            One-time payments
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {oneTimePayments.map((p) => (
              <div key={p.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input
                  type="text"
                  value={p.label}
                  placeholder="Bonus"
                  onChange={(e) => updatePayment(p.id, { label: e.target.value })}
                  style={{ ...inputStyle, width: 130 }}
                />
                <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  $<input
                    type="number"
                    value={p.amount}
                    step={1000}
                    onChange={(e) => updatePayment(p.id, { amount: +e.target.value })}
                    style={{ ...inputStyle, width: 100 }}
                  />
                </label>
                <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  in <input
                    type="number"
                    value={p.year}
                    step={1}
                    onChange={(e) => updatePayment(p.id, { year: +e.target.value })}
                    style={{ ...inputStyle, width: 70 }}
                  />
                </label>
                <button
                  onClick={() => removePayment(p.id)}
                  aria-label="Remove one-time payment"
                  style={{ background: "none", border: "none", cursor: "pointer", color: T.loss, fontSize: 17, lineHeight: 1, padding: "0 4px" }}
                >
                  ×
                </button>
              </div>
            ))}
            <button
              onClick={addPayment}
              style={{
                alignSelf: "flex-start", background: "none", border: `1px dashed ${T.line}`, borderRadius: 8,
                padding: "6px 12px", fontFamily: "inherit", fontSize: 12.5, color: T.gain, cursor: "pointer",
              }}
            >
              + Add one-time payment
            </button>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          {YEARS.map((y) => {
            const v = fvWithLumpSums(startNW, planMonthly, planReturn / 100, monthsTo(y), lumpSums);
            const hit = TARGETS.filter((t) => v >= t).pop();
            return (
              <div key={y} style={{ flex: 1, minWidth: 130, border: `1px solid ${T.line}`, borderRadius: 8, padding: "12px 14px", background: "#FAFCFA" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", color: T.ink, textTransform: "uppercase" }}>{y}</div>
                <div style={{ fontFamily: serif, fontSize: 23, fontWeight: 600, marginTop: 4 }}>{usdK(v)}</div>
                {hit && <div style={{ fontSize: 11, fontFamily: mono, color: T.gain, marginTop: 3 }}>≥ {usdK(hit)} ✓</div>}
              </div>
            );
          })}
        </div>

        <div style={{ height: 230, marginTop: 20 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={projection} margin={{ left: 8, right: 8, top: 6 }}>
              <defs>
                <linearGradient id="proj" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.gain} stopOpacity={0.3} />
                  <stop offset="100%" stopColor={T.gain} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={T.line} vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval="preserveStartEnd" />
              <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={56} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="v" stroke={T.gain} strokeWidth={2} fill="url(#proj)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 11.5, color: T.ink, marginTop: 8 }}>
          Deterministic compounding at a constant rate — a planning sketch, not a forecast. A real build could layer Monte Carlo bands here.
        </div>
      </Card>

      {/* ---- Section 3: Composition forecast ---- */}
      <Card style={{ marginTop: 16 }}>
        <div>
          <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }}>Composition forecast</div>
          <div style={{ fontSize: 12.5, color: T.ink, marginTop: 3 }}>
            Today&apos;s actual mix, projected forward on whatever you plan to keep buying each month.
          </div>
        </div>

        <div style={{ overflowX: "auto", marginTop: 16 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 520 }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: "left" }}>Bucket</th>
                <th style={{ ...th }}>Status quo</th>
                <th style={{ ...th }}>$/mo investing</th>
                <th style={{ ...th }}>Expected return</th>
              </tr>
            </thead>
            <tbody>
              {BUCKETS.map((b) => (
                <tr key={b}>
                  <td style={{ ...td, textAlign: "left", fontWeight: 600, fontFamily: "inherit" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: BUCKET_COLOR[b] }} />
                      {b}
                    </span>
                  </td>
                  <td style={{ ...td, color: T.ink }}>{usd(statusQuo[b])}</td>
                  <td style={td}>
                    $
                    <input
                      type="number"
                      value={monthlyByBucket[b]}
                      min={0}
                      step={100}
                      onChange={(e) => setMonthlyByBucket((s) => ({ ...s, [b]: +e.target.value }))}
                      style={{ ...inputStyle, width: 90, marginLeft: 4 }}
                    />
                  </td>
                  <td style={td}>
                    <input
                      type="number"
                      value={returnByBucket[b]}
                      min={-20}
                      max={60}
                      step={0.5}
                      onChange={(e) => setReturnByBucket((s) => ({ ...s, [b]: +e.target.value }))}
                      style={{ ...inputStyle, width: 70 }}
                    />
                    %/yr
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <CompositionForecastCard
          points={compositionForecast}
          bands={BUCKETS.map((b) => [b, BUCKET_COLOR[b]] as [string, string])}
          caption={`Investing ${usd(BUCKETS.reduce((s, b) => s + monthlyByBucket[b], 0))}/mo total across the buckets above`}
        />
        <CompositionForecastCard
          points={compositionForecast}
          bands={BUCKETS.map((b) => [b, BUCKET_COLOR[b]] as [string, string])}
          mode="dollar"
          caption={`Ending at ${usd(BUCKETS.reduce((s, b) => s + (Number(compositionForecast.at(-1)?.[b]) || 0), 0))} total by ${compositionForecast.at(-1)?.m}`}
        />
        <div style={{ fontSize: 11.5, color: T.ink, marginTop: 8 }}>
          Deterministic compounding at a constant monthly contribution and return per bucket — a planning sketch, not a forecast.
        </div>
      </Card>
    </div>
  );
}
