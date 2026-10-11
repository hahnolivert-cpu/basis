"use client";

import { useMemo, type CSSProperties, type ReactNode } from "react";
import { LineChart, Line, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { T, mono, serif } from "@/lib/theme";
import { eur, eurK, maskDigits, usd } from "@/lib/format";
import { Card, Eyebrow, Toggle } from "@/components/ui";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { usePrivacy } from "@/lib/privacy-context";
import { useQuotes } from "@/lib/hooks/useQuotes";
import { cashNeeded, closingCosts, fixedPeriodMonths, loanAmount, propertyValueAfter, simulate, type MortgageInputs, type OneOffRepayment } from "@/lib/realestate";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const monthYear = (year: number, month: number) => `${MONTHS[month - 1]} ${year}`;
const duration = (months: number) => {
  const y = Math.floor(months / 12);
  const m = months % 12;
  return y && m ? `${y}y ${m}m` : y ? `${y}y` : `${m}m`;
};

// Starting point taken from the Volksbank Raffeisenbank Rosenheim offer
// (Schwäbisch Hall, 09.10.2026): €580k loan at 4.43% with a 10-year
// Zinsbindung, disbursed 1 Feb 2027 with interest-only in February, and a
// 10% p.a. Sondertilgung allowance. Tilgung is 2% here, not the offer's 3%.
// Price and closing costs are NOT in the offer — placeholders, edit them.
// Sondertilgung amounts are assumed to use the full allowance.
const DEFAULTS: MortgageInputs = {
  price: 700000,
  loan: 580000,
  taxPct: 3.5, // Bavaria
  notaryPct: 2,
  agentPct: 3.57,
  ratePct: 4.43,
  repayPct: 2,
  // The offer's stated Restschuld (€370,518.20 at 3% Tilgung) is the balance
  // after the Oct 2036 payment — 117 payments in, not a round 120.
  fixedEnd: "2036-10",
  start: "2027-02",
  repayStart: "2027-03",
  annualExtra: 58000,
  extraMonth: 1,
  extraFromYear: 2028,
  capPct: 10,
  oneOffs: [{ id: "first-sondertilgung", label: "First Sondertilgung", amount: 58000, year: 2027, month: 9 }],
  appreciationPct: 2,
  monthlyRunning: 0,
};

const inputStyle: CSSProperties = {
  fontFamily: mono, fontSize: 14, padding: "8px 10px", border: `1px solid ${T.line}`, borderRadius: 8,
  width: "100%", minWidth: 0, boxSizing: "border-box", background: T.card, color: T.ink,
};

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 11.5, color: T.ink }}>
      <span style={{ letterSpacing: "0.06em", textTransform: "uppercase", fontSize: 10.5 }}>{label}</span>
      {children}
      {hint && <span style={{ fontSize: 11, opacity: 0.7 }}>{hint}</span>}
    </label>
  );
}

const grid: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 14 };

function Stat({ label, value, sub, tone }: { label: string; value: string; sub?: string; tone?: "gain" | "loss" }) {
  return (
    <div style={{ flex: 1, minWidth: 150, border: `1px solid ${T.line}`, borderRadius: 8, padding: "12px 14px", background: T.subtleBg }}>
      <div style={{ fontSize: 10.5, letterSpacing: "0.1em", color: T.ink, textTransform: "uppercase" }}>{label}</div>
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginTop: 4, color: tone ? T[tone] : undefined }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, fontFamily: mono, color: T.ink, marginTop: 3, opacity: 0.85 }}>{sub}</div>}
    </div>
  );
}

export function RealEstateTab() {
  const { hideAmounts } = usePrivacy();
  const [saved, setSaved] = usePersistedState<Partial<MortgageInputs>>("basis:realestate:v2", DEFAULTS);
  const [useExtras, setUseExtras] = usePersistedState("basis:realestate:v2:useExtras", true);
  // Merged over DEFAULTS so a field added in a later version doesn't arrive
  // as undefined for someone with an older saved copy.
  const inp: MortgageInputs = useMemo(() => ({ ...DEFAULTS, ...saved }), [saved]);
  const set = (patch: Partial<MortgageInputs>) => setSaved((s) => ({ ...DEFAULTS, ...s, ...patch }));
  const num = (key: keyof MortgageInputs) => (e: React.ChangeEvent<HTMLInputElement>) => set({ [key]: +e.target.value } as Partial<MortgageInputs>);

  // FX: USD per 1 EUR. Live rate from the quotes feed unless overridden.
  const { data: quotes } = useQuotes();
  const [fxOverride, setFxOverride] = usePersistedState<number | null>("basis:realestate:v2:fx", null);
  const [fxStep, setFxStep] = usePersistedState("basis:realestate:v2:fxStep", 5);
  const liveFx = quotes?.eurusd ?? null;
  const spotFx = fxOverride ?? liveFx;

  const mask = (s: string) => (hideAmounts ? maskDigits(s) : s);
  const e0 = (n: number) => mask(eur(n));

  const withPlan = useMemo(() => simulate(inp, useExtras), [inp, useExtras]);
  const baseline = useMemo(() => simulate(inp, false), [inp]);

  const costs = closingCosts(inp);
  const loan = loanAmount(inp);
  const upfront = cashNeeded(inp);
  const capAmount = inp.capPct > 0 ? (loan * inp.capPct) / 100 : null;
  const overCapYears = withPlan.clampedYears;

  const fixedMonths = fixedPeriodMonths(inp);
  const fixedValue = propertyValueAfter(inp, fixedMonths);
  const fixedEquity = fixedValue - withPlan.balanceAtFixedEnd;
  const fixedYear = Number(inp.fixedEnd.slice(0, 4));
  const fixedLabel = monthYear(fixedYear, Number(inp.fixedEnd.slice(5, 7)) || 1);
  const fixedYearsApprox = Math.round(fixedMonths / 12);

  const interestSaved = baseline.totalInterest - withPlan.totalInterest;
  const monthsSaved = baseline.months - withPlan.months;

  const chart = useMemo(() => {
    const last = Math.max(withPlan.endYear, baseline.endYear);
    const first = baseline.years[0]?.year ?? new Date().getFullYear();
    const at = (rows: typeof baseline.years, y: number) => rows.find((r) => r.year === y);
    const out = [];
    for (let y = first; y <= last; y++) {
      const a = at(withPlan.years, y);
      const b = at(baseline.years, y);
      out.push({
        y: String(y),
        withPlan: Math.round(a ? a.endBalance : y > withPlan.endYear ? 0 : loan),
        baseline: Math.round(b ? b.endBalance : y > baseline.endYear ? 0 : loan),
        value: Math.round((b ?? a)?.propertyValue ?? inp.price),
      });
    }
    return out;
  }, [withPlan, baseline, loan, inp.price]);

  const updateOneOff = (id: string, patch: Partial<OneOffRepayment>) =>
    set({ oneOffs: inp.oneOffs.map((o) => (o.id === id ? { ...o, ...patch } : o)) });
  const addOneOff = () =>
    set({ oneOffs: [...inp.oneOffs, { id: crypto.randomUUID(), label: "Bonus", amount: 20000, year: new Date().getFullYear() + 1, month: 1 }] });
  const removeOneOff = (id: string) => set({ oneOffs: inp.oneOffs.filter((o) => o.id !== id) });

  const th: CSSProperties = { padding: "10px 12px", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.ink, textAlign: "right", borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" };
  const td: CSSProperties = { padding: "9px 12px", fontFamily: mono, fontSize: 12.5, textAlign: "right", borderBottom: `1px solid ${T.line}`, whiteSpace: "nowrap" };

  const noLoan = loan <= 0;

  return (
    <div>
      <Card style={{ marginTop: 22 }}>
        <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }}>Real estate</div>
        <div style={{ fontSize: 12.5, color: T.ink, marginTop: 3, lineHeight: 1.55 }}>
          Model a purchase financed with a German-style annuity loan. All figures in EUR. The monthly payment stays fixed, so every
          Sondertilgung shortens the term instead of lowering the payment. Everything here is a what-if — nothing feeds into your net worth.
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Eyebrow>Property &amp; purchase costs</Eyebrow>
        <div style={grid}>
          <Field label="Purchase price (€)" hint="Not in the offer — enter yours"><input type="number" style={inputStyle} value={inp.price} min={0} step={10000} onChange={num("price")} /></Field>
          <Field label="Grunderwerbsteuer (%)" hint="Bavaria 3.5%"><input type="number" style={inputStyle} value={inp.taxPct} min={0} step={0.5} onChange={num("taxPct")} /></Field>
          <Field label="Notar & Grundbuch (%)" hint="Roughly 1.5–2%"><input type="number" style={inputStyle} value={inp.notaryPct} min={0} step={0.1} onChange={num("notaryPct")} /></Field>
          <Field label="Makler (%)" hint="0 if no agent"><input type="number" style={inputStyle} value={inp.agentPct} min={0} step={0.01} onChange={num("agentPct")} /></Field>
          <Field label="Running costs (€/mo)" hint="Hausgeld, upkeep — not the loan"><input type="number" style={inputStyle} value={inp.monthlyRunning} min={0} step={50} onChange={num("monthlyRunning")} /></Field>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Eyebrow>Loan</Eyebrow>
        <div style={grid}>
          <Field label="Loan amount (€)" hint="Darlehensbetrag"><input type="number" style={inputStyle} value={inp.loan} min={0} step={10000} onChange={num("loan")} /></Field>
          <Field label="Interest rate (% p.a.)" hint="Gebundener Sollzins"><input type="number" style={inputStyle} value={inp.ratePct} min={0} step={0.01} onChange={num("ratePct")} /></Field>
          <Field label="Initial repayment (%)" hint="Tilgungssatz — the offer says 3%"><input type="number" style={inputStyle} value={inp.repayPct} min={0} step={0.25} onChange={num("repayPct")} /></Field>
          <Field label="Disbursement" hint="Auszahlung; that month is interest-only"><input type="month" style={inputStyle} value={inp.start} onChange={(e) => e.target.value && set({ start: e.target.value })} /></Field>
          <Field label="Repayment starts" hint="Tilgungsbeginn"><input type="month" style={inputStyle} value={inp.repayStart} onChange={(e) => e.target.value && set({ repayStart: e.target.value })} /></Field>
          <Field label="Zinsbindung ends" hint="Offer: 10 years"><input type="month" style={inputStyle} value={inp.fixedEnd} onChange={(e) => e.target.value && set({ fixedEnd: e.target.value })} /></Field>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <Eyebrow>Appreciation</Eyebrow>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <div style={{ width: 170 }}>
            <Field label="Value growth (% per year)">
              <input type="number" style={inputStyle} value={inp.appreciationPct} step={0.5} onChange={num("appreciationPct")} />
            </Field>
          </div>
          <div style={{ display: "flex", gap: 2, background: T.headerBg, borderRadius: 999, padding: 2 }}>
            {[0, 1, 2, 3, 4, 5].map((v) => (
              <button
                key={v}
                onClick={() => set({ appreciationPct: v })}
                style={{
                  border: "none", cursor: "pointer", padding: "5px 11px", fontFamily: mono, borderRadius: 999, fontSize: 11.5,
                  fontWeight: inp.appreciationPct === v ? 700 : 500,
                  background: inp.appreciationPct === v ? T.gain : "none", color: inp.appreciationPct === v ? "#fff" : T.inkSoft,
                }}
              >
                {v}%
              </button>
            ))}
          </div>
        </div>
        <div style={{ fontSize: 12, color: T.ink, marginTop: 12, lineHeight: 1.55 }}>
          Property value in {fixedLabel}: <span style={{ fontFamily: mono }}>{e0(fixedValue)}</span>{" "}
          <span style={{ fontFamily: mono, opacity: 0.75 }}>({fixedValue >= inp.price ? "+" : ""}{(((fixedValue - inp.price) / (inp.price || 1)) * 100).toFixed(0)}% vs. purchase price)</span>
        </div>
      </Card>

      <Card style={{ marginTop: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 14 }}>
          <Eyebrow style={{ marginBottom: 0 }}>Sondertilgungen</Eyebrow>
          <Toggle on={useExtras} setOn={setUseExtras} label={useExtras ? "Included" : "Excluded"} size="sm" />
        </div>
        <div style={{ ...grid, opacity: useExtras ? 1 : 0.5 }}>
          <Field label="Recurring, per year (€)" hint="Max allowed = limit below"><input type="number" style={inputStyle} value={inp.annualExtra} min={0} step={1000} onChange={num("annualExtra")} /></Field>
          <Field label="Paid in">
            <select style={inputStyle} value={inp.extraMonth} onChange={(e) => set({ extraMonth: +e.target.value })}>
              {MONTHS.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
            </select>
          </Field>
          <Field label="Starting from year"><input type="number" style={inputStyle} value={inp.extraFromYear} step={1} onChange={num("extraFromYear")} /></Field>
          <Field label="Yearly limit (% of loan)" hint="Offer: 10%. 0 = none"><input type="number" style={inputStyle} value={inp.capPct} min={0} step={1} onChange={num("capPct")} /></Field>
        </div>

        <div style={{ marginTop: 16, opacity: useExtras ? 1 : 0.5 }}>
          <div style={{ fontSize: 11, letterSpacing: "0.08em", textTransform: "uppercase", color: T.ink, marginBottom: 8 }}>One-time Sondertilgungen</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {inp.oneOffs.map((o: OneOffRepayment) => (
              <div key={o.id} style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                <input type="text" value={o.label} placeholder="Bonus" onChange={(e) => updateOneOff(o.id, { label: e.target.value })} style={{ ...inputStyle, width: 130 }} />
                <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  €<input type="number" value={o.amount} step={1000} onChange={(e) => updateOneOff(o.id, { amount: +e.target.value })} style={{ ...inputStyle, width: 110 }} />
                </label>
                <label style={{ fontSize: 12.5, color: T.ink, display: "inline-flex", alignItems: "center", gap: 6 }}>
                  in
                  <select value={o.month} onChange={(e) => updateOneOff(o.id, { month: +e.target.value })} style={{ ...inputStyle, width: 80 }}>
                    {MONTHS.map((m, idx) => <option key={m} value={idx + 1}>{m}</option>)}
                  </select>
                  <input type="number" value={o.year} step={1} onChange={(e) => updateOneOff(o.id, { year: +e.target.value })} style={{ ...inputStyle, width: 80 }} />
                </label>
                <button onClick={() => removeOneOff(o.id)} aria-label="Remove one-time Sondertilgung" style={{ background: "none", border: "none", cursor: "pointer", color: T.loss, fontSize: 17, lineHeight: 1, padding: "0 4px" }}>×</button>
              </div>
            ))}
            <button onClick={addOneOff} style={{ alignSelf: "flex-start", background: "none", border: `1px dashed ${T.line}`, borderRadius: 8, padding: "6px 12px", fontFamily: "inherit", fontSize: 12.5, color: T.gain, cursor: "pointer" }}>
              + Add one-time Sondertilgung
            </button>
          </div>
        </div>

        {useExtras && capAmount !== null && (
          <div style={{ fontSize: 12, marginTop: 14, color: overCapYears.length ? T.loss : T.ink, lineHeight: 1.5 }}>
            {overCapYears.length
              ? `Limit is ${e0(capAmount)} per year — more than that is clamped in ${overCapYears.join(", ")}, so the model only counts ${e0(capAmount)} for those years.`
              : `Within your bank's limit of ${e0(capAmount)} per year.`}
          </div>
        )}
      </Card>

      {noLoan ? (
        <Card style={{ marginTop: 16 }}>
          <div style={{ fontSize: 13, color: T.ink }}>Your down payment covers the price and costs — no loan needed.</div>
        </Card>
      ) : (
        <>
          <Card style={{ marginTop: 16 }}>
            <Eyebrow>Result</Eyebrow>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <Stat label="Loan amount" value={e0(loan)} sub={inp.price > 0 ? `${((loan / inp.price) * 100).toFixed(0)}% of price` : undefined} />
              <Stat label="Monthly payment" value={e0(withPlan.payment)} sub={`${e0(withPlan.payment + inp.monthlyRunning)} with running costs`} />
              <Stat label="Cash needed upfront" value={e0(upfront)} sub={`${e0(inp.price)} price + ${e0(costs)} costs − ${e0(loan)} loan`} />
              <Stat
                label="Debt-free"
                value={withPlan.paidOff ? monthYear(withPlan.endYear, withPlan.endMonth) : "50+ years"}
                sub={withPlan.paidOff ? `after ${duration(withPlan.months)}` : "payment barely covers interest"}
                tone={useExtras && monthsSaved > 0 ? "gain" : undefined}
              />
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
              <Stat label="Total interest" value={e0(withPlan.totalInterest)} sub={useExtras ? `${e0(baseline.totalInterest)} without` : undefined} />
              {useExtras && (
                <Stat
                  label="Saved by Sondertilgungen"
                  value={e0(interestSaved)}
                  sub={monthsSaved > 0 ? `${duration(monthsSaved)} sooner · ${e0(withPlan.totalExtra)} paid extra` : "no effect — check the settings"}
                  tone={interestSaved > 0 ? "gain" : undefined}
                />
              )}
              <Stat
                label={`Restschuld, ${fixedLabel}`}
                value={e0(withPlan.balanceAtFixedEnd)}
                sub={withPlan.balanceAtFixedEnd > 0 ? `after ~${fixedYearsApprox}y · needs refinancing at the then-current rate` : "fully repaid"}
              />
              <Stat label={`Equity, ${fixedLabel}`} value={e0(fixedEquity)} sub={`value ${e0(fixedValue)} − debt ${e0(withPlan.balanceAtFixedEnd)}`} tone={fixedEquity > 0 ? "gain" : "loss"} />
            </div>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Eyebrow>Remaining debt vs. property value</Eyebrow>
            <div style={{ height: 260 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chart} margin={{ left: 8, right: 8, top: 6 }}>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="y" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={(v: number) => mask(eurK(v))} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={56} />
                  <Tooltip
                    content={({ active, payload, label }) => {
                      if (!active || !payload?.length) return null;
                      return (
                        <div style={{ background: T.tooltipBg, color: "#fff", padding: "7px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                          <div style={{ marginBottom: 3 }}>{label}</div>
                          {payload.map((p) => <div key={String(p.dataKey)}>{p.name} {e0(Number(p.value))}</div>)}
                        </div>
                      );
                    }}
                  />
                  <Legend iconType="plainline" wrapperStyle={{ fontSize: 11.5, fontFamily: mono }} />
                  <Line type="monotone" dataKey="value" name="Property value" stroke={T.chart[2]} strokeWidth={1.6} dot={false} />
                  <Line type="monotone" dataKey="baseline" name="Debt, no Sondertilgung" stroke={T.ink} strokeWidth={1.4} strokeDasharray="5 4" dot={false} />
                  {useExtras && <Line type="monotone" dataKey="withPlan" name="Debt, with Sondertilgung" stroke={T.gain} strokeWidth={2.2} dot={false} />}
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Eyebrow>Year by year</Eyebrow>
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 680 }}>
                <thead>
                  <tr>
                    <th style={{ ...th, textAlign: "left" }}>Year</th>
                    <th style={th}>Interest</th>
                    <th style={th}>Repayment</th>
                    <th style={th}>Sondertilgung</th>
                    <th style={th}>Remaining debt</th>
                    <th style={th}>Property value</th>
                    <th style={th}>Equity</th>
                  </tr>
                </thead>
                <tbody>
                  {withPlan.years.map((r) => (
                    <tr key={r.year}>
                      <td style={{ ...td, textAlign: "left", fontWeight: 600 }}>{r.year}</td>
                      <td style={td}>{e0(r.interest)}</td>
                      <td style={td}>{e0(r.principal)}</td>
                      <td style={{ ...td, color: r.extra > 0 ? T.gain : T.ink }}>{r.extra > 0 ? e0(r.extra) : "—"}</td>
                      <td style={td}>{e0(r.endBalance)}</td>
                      <td style={td}>{e0(r.propertyValue)}</td>
                      <td style={{ ...td, fontWeight: 500 }}>{e0(r.equity)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ fontSize: 11.5, color: T.ink, marginTop: 12, lineHeight: 1.5 }}>
              Assumes the interest rate stays the same after the fixed period ends — in reality the follow-up loan is priced at the
              then-current rate. Property value uses a flat growth rate; it ignores selling costs.
            </div>
          </Card>
        </>
      )}

      {/* ---- USD / EUR sensitivity ---- */}
      <Card style={{ marginTop: 16 }}>
        <Eyebrow>USD / EUR sensitivity</Eyebrow>
        <div style={{ fontSize: 12.5, color: T.ink, lineHeight: 1.55, marginBottom: 14 }}>
          The property, loan and payments are all in EUR, while your wealth is mostly USD. This shows what the same purchase costs in USD if
          EUR/USD moves before you pay — the upfront cash and Sondertilgungen are the exposed parts, since each one converts USD into EUR when you pay it.
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end", marginBottom: 14 }}>
          <div style={{ width: 170 }}>
            <Field label="EUR/USD (USD per €1)" hint={fxOverride === null ? (liveFx ? "Live rate" : "Live rate unavailable — enter one") : "Your override"}>
              <input
                type="number" style={inputStyle} step={0.01} min={0}
                value={spotFx ?? ""}
                onChange={(e) => setFxOverride(e.target.value === "" ? null : +e.target.value)}
              />
            </Field>
          </div>
          <div style={{ width: 130 }}>
            <Field label="Step (%)">
              <input type="number" style={inputStyle} step={1} min={1} max={25} value={fxStep} onChange={(e) => setFxStep(Math.max(1, +e.target.value || 1))} />
            </Field>
          </div>
          {fxOverride !== null && (
            <button onClick={() => setFxOverride(null)} style={{ background: "none", border: `1px dashed ${T.line}`, borderRadius: 8, padding: "8px 12px", fontFamily: "inherit", fontSize: 12.5, color: T.gain, cursor: "pointer" }}>
              Use live rate
            </button>
          )}
        </div>

        {spotFx && spotFx > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 760 }}>
              <thead>
                <tr>
                  <th style={{ ...th, textAlign: "left" }}>EUR/USD</th>
                  <th style={th}>Upfront cash</th>
                  <th style={th}>vs. today</th>
                  <th style={th}>Monthly payment</th>
                  <th style={th}>Sondertilgung / yr</th>
                  <th style={th}>Total cash out</th>
                  <th style={th}>Equity, {fixedLabel}</th>
                </tr>
              </thead>
              <tbody>
                {[-4, -3, -2, -1, 0, 1, 2, 3, 4].map((k) => {
                  const pct = k * fxStep;
                  const rate = spotFx * (1 + pct / 100);
                  const base = upfront * spotFx;
                  const cell = rate > 0 ? upfront * rate : 0;
                  const isSpot = k === 0;
                  const rowStyle: CSSProperties = isSpot ? { background: T.tint, fontWeight: 600 } : {};
                  const totalOut = (upfront + loan + withPlan.totalInterest) * rate;
                  return (
                    <tr key={k} style={rowStyle}>
                      <td style={{ ...td, textAlign: "left" }}>
                        {rate.toFixed(4)}{" "}
                        <span style={{ opacity: 0.65, fontWeight: 400 }}>{isSpot ? "today" : `${pct > 0 ? "+" : ""}${pct}%`}</span>
                      </td>
                      <td style={td}>{mask(usd(cell))}</td>
                      <td style={{ ...td, color: isSpot ? T.ink : cell > base ? T.loss : T.gain }}>
                        {isSpot ? "—" : mask(`${cell > base ? "+" : "−"}${usd(Math.abs(cell - base))}`)}
                      </td>
                      <td style={td}>{mask(usd(withPlan.payment * rate))}</td>
                      <td style={td}>{useExtras && inp.annualExtra > 0 ? mask(usd(inp.annualExtra * rate)) : "—"}</td>
                      <td style={td}>{mask(usd(totalOut))}</td>
                      <td style={td}>{mask(usd(fixedEquity * rate))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div style={{ fontSize: 13, color: T.ink }}>Enter an EUR/USD rate above to see the table.</div>
        )}
        <div style={{ fontSize: 11.5, color: T.ink, marginTop: 12, lineHeight: 1.5 }}>
          Upfront cash and Sondertilgungen are paid at whatever the rate is on the day — the table assumes that rate for all of them.
          Monthly payment is shown the same way, but if you earn EUR it isn&apos;t exposed. The equity column is the EUR property value minus
          the EUR debt, converted at that rate: the loan is a EUR liability, so it hedges part of the property&apos;s currency exposure.
        </div>
      </Card>
    </div>
  );
}
