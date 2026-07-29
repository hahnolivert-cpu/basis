import { useState, useMemo, useEffect } from "react";
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  BarChart, Bar, XAxis, YAxis, AreaChart, Area, CartesianGrid,
} from "recharts";

/* ------------------------------------------------------------------ */
/* Design tokens — cool paper, ledger-green ink, serif display,        */
/* mono numerals.                                                      */
/* ------------------------------------------------------------------ */
const T = {
  paper: "#F6F8F6",
  card: "#FFFFFF",
  ink: "#152019",
  inkSoft: "#5C6B62",
  line: "#E2E8E3",
  ledger: "#0E5B43",
  gain: "#0F8A5F",
  loss: "#C43D31",
  chart: ["#0E5B43", "#3E7C68", "#6E9D8D", "#2F4858", "#C09A5B", "#7A6C5D", "#A85D4A", "#9EBEB2"],
};
const mono = "'IBM Plex Mono', ui-monospace, monospace";
const serif = "'Fraunces', Georgia, serif";

/* ------------------------------------------------------------------ */
/* Static data — seeded from your Kubera + Yahoo screenshots.          */
/* (est.) rows are placeholders sized to match account totals.        */
/* yld = estimated trailing dividend/interest yield.                   */
/* ------------------------------------------------------------------ */
const ETF_DATA = {
  SPHQ: { sectors: { Technology: 0.32, Industrials: 0.21, "Health Care": 0.13, Financials: 0.11, "Consumer Disc.": 0.09, "Comm. Services": 0.08, Other: 0.06 }, geos: { "United States": 1.0 } },
  ILF: { sectors: { Financials: 0.36, Materials: 0.17, Energy: 0.14, "Consumer Staples": 0.13, Industrials: 0.08, Utilities: 0.07, Other: 0.05 }, geos: { Brazil: 0.58, Mexico: 0.26, Chile: 0.08, Peru: 0.05, Colombia: 0.03 } },
  SGOV: { sectors: { "Govt. Bonds": 1.0 }, geos: { "United States": 1.0 } },
  VOO: { sectors: { Technology: 0.33, Financials: 0.13, "Health Care": 0.11, "Consumer Disc.": 0.11, "Comm. Services": 0.09, Industrials: 0.08, Other: 0.15 }, geos: { "United States": 1.0 } },
};

// qty = share/coin count implied by screenshot values; live sync reprices qty x price.
const BASE_HOLDINGS = [
  // ---- 976 Capital · Cash (Brex) ----
  { sym: "Brex Checking", name: "Primary checking ··1593", pf: "capital", acct: "Brex", cls: "Cash", value: 3057, cost: 3057, day: 0, sector: "Cash", geo: "United States", yld: 0 },
  { sym: "Brex Treasury", name: "Treasury ··5461", pf: "capital", acct: "Brex", cls: "Cash", value: 370714, cost: 370714, day: 0.01, sector: "Cash", geo: "United States", yld: 4.3 },
  // ---- 976 Capital · IBKR ----
  { sym: "MSTR", qty: 13.7, name: "Strategy Inc", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 2809.63, cost: 7701.93, day: -2.31, sector: "Technology", geo: "United States", yld: 0 },
  { sym: "SPHQ", qty: 266.57, name: "Invesco S&P 500 Quality ETF", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 19192.87, cost: 16504.98, day: -0.68, etf: "SPHQ", yld: 1.3 },
  { sym: "GOOGL", qty: 76.88, name: "Alphabet Inc.", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 15069.18, cost: 14122.32, day: 2.5, sector: "Comm. Services", geo: "United States", yld: 0.45 },
  { sym: "ILF", qty: 317.14, name: "iShares Latin America 40 ETF", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 9197.15, cost: 9209.11, day: 0.27, etf: "ILF", yld: 5.6 },
  { sym: "TTD", qty: 66.91, name: "The Trade Desk, Inc.", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 5085.45, cost: 6380.55, day: 5.34, sector: "Technology", geo: "United States", yld: 0 },
  { sym: "SGOV", qty: 1542.29, name: "iShares 0-3 Mo Treasury ETF (est.)", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 155000, cost: 154200, day: 0.01, etf: "SGOV", yld: 4.7 },
  { sym: "NVDA", qty: 200, name: "NVIDIA Corp (est.)", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 36400, cost: 21000, day: 1.2, sector: "Technology", geo: "United States", yld: 0.03 },
  { sym: "AMZN", qty: 125.21, name: "Amazon.com (est.)", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 29300, cost: 24800, day: 0.8, sector: "Consumer Disc.", geo: "United States", yld: 0 },
  // ---- 976 Capital · Crypto (Paxos) ----
  { sym: "BTC", qty: 0.1365, name: "Bitcoin · 0.1365", pf: "capital", acct: "Paxos", cls: "Crypto", value: 8711, cost: 6100, day: -1.9, sector: "Crypto", geo: "Global", yld: 0 },
  { sym: "ETH", qty: 3.1152, name: "Ethereum · 3.1152", pf: "capital", acct: "Paxos", cls: "Crypto", value: 5960, cost: 7400, day: -2.4, sector: "Crypto", geo: "Global", yld: 0 },
  { sym: "SOL", qty: 21.0405, name: "Solana · 21.04", pf: "capital", acct: "Paxos", cls: "Crypto", value: 1564, cost: 1900, day: -3.2, sector: "Crypto", geo: "Global", yld: 0 },
  // ---- Personal ----
  { sym: "Chase Checking", name: "Total checking ··4410 (est.)", pf: "personal", acct: "Chase", cls: "Cash", value: 61719, cost: 61719, day: 0, sector: "Cash", geo: "United States", yld: 0 },
  { sym: "VOO", qty: 500, name: "Vanguard S&P 500 ETF (est.)", pf: "personal", acct: "Robinhood", cls: "Equities", value: 285000, cost: 228000, day: 0.4, etf: "VOO", yld: 1.25 },
  { sym: "AAPL", qty: 176.19, name: "Apple Inc (est.)", pf: "personal", acct: "Robinhood", cls: "Equities", value: 37000, cost: 22000, day: -0.3, sector: "Technology", geo: "United States", yld: 0.4 },
  { sym: "GOOGL", qty: 76.53, name: "Alphabet Inc. (est.)", pf: "personal", acct: "Robinhood", cls: "Equities", value: 15000, cost: 12000, day: 2.5, sector: "Comm. Services", geo: "United States", yld: 0.45 },
  { sym: "LINK", qty: 4209.17, name: "Chainlink · USD", pf: "personal", acct: "Robinhood", cls: "Crypto", value: 67346.66, cost: 101728.45, day: -3.09, sector: "Crypto", geo: "Global", yld: 0 },
  { sym: "HYPE", qty: 561.34, name: "Hyperliquid · USD", pf: "personal", acct: "Robinhood", cls: "Crypto", value: 23576.44, cost: 18184.95, day: -3.51, sector: "Crypto", geo: "Global", yld: 0 },
];

const DEBTS = 24271;

// Mock net-worth history (monthly closes, $k) — real build derives this
// from daily snapshots of synced balances.
const NW_HISTORY = [
  ["Jan 25", 742], ["Feb 25", 768], ["Mar 25", 751], ["Apr 25", 803],
  ["May 25", 842], ["Jun 25", 861], ["Jul 25", 894], ["Aug 25", 872],
  ["Sep 25", 918], ["Oct 25", 967], ["Nov 25", 1004], ["Dec 25", 1051],
  ["Jan 26", 1032], ["Feb 26", 1069], ["Mar 26", 1046], ["Apr 26", 1088],
  ["May 26", 1121], ["Jun 26", 1107], ["Jul 26", 1128],
].map(([m, v]) => ({ m, v: v * 1000 }));

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */
const fmt = (n, dp = 0) => n.toLocaleString("en-US", { minimumFractionDigits: dp, maximumFractionDigits: dp });
const usd = (n, dp = 0) => (n < 0 ? "-$" : "$") + fmt(Math.abs(n), dp);
const usdK = (n) => (Math.abs(n) >= 1e6 ? "$" + (n / 1e6).toFixed(2) + "M" : "$" + Math.round(n / 1000) + "k");
const sign = (n, s) => (n >= 0 ? "+" : "") + s;

const fvCalc = (P, monthly, annual, months) => {
  const r = annual / 12;
  if (r === 0) return P + monthly * months;
  const g = Math.pow(1 + r, months);
  return P * g + monthly * ((g - 1) / r);
};
const reqMonthly = (target, P, annual, months) => {
  const r = annual / 12;
  const g = Math.pow(1 + r, months);
  if (r === 0) return (target - P) / months;
  return ((target - P * g) * r) / (g - 1);
};
const reqReturn = (target, P, monthly, months) => {
  if (fvCalc(P, monthly, 0, months) >= target) return 0;
  let lo = 0, hi = 0.6;
  if (fvCalc(P, monthly, hi, months) < target) return null;
  for (let i = 0; i < 60; i++) {
    const mid = (lo + hi) / 2;
    fvCalc(P, monthly, mid, months) < target ? (lo = mid) : (hi = mid);
  }
  return (lo + hi) / 2;
};

const subclass = (h) => (h.cls === "Equities" ? (h.etf ? "ETFs" : "Stocks") : h.cls);

function aggregate(rows, dim, lookThrough) {
  const map = {};
  const add = (k, v) => (map[k] = (map[k] || 0) + v);
  for (const h of rows) {
    if (dim === "class") { add(subclass(h), h.value); continue; }
    if (h.etf) {
      if (lookThrough) Object.entries(dim === "sector" ? ETF_DATA[h.etf].sectors : ETF_DATA[h.etf].geos).forEach(([k, w]) => add(k, h.value * w));
      else add("ETFs (opaque)", h.value);
      continue;
    }
    add(dim === "sector" ? h.sector : h.geo, h.value);
  }
  return Object.entries(map).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
}

/* ------------------------------------------------------------------ */
/* Shared UI                                                           */
/* ------------------------------------------------------------------ */
const Delta = ({ pct, amt, size = 13 }) => (
  <span style={{ color: pct >= 0 ? T.gain : T.loss, fontFamily: mono, fontSize: size }}>
    {sign(amt, usd(amt))} <span style={{ opacity: 0.75 }}>({sign(pct, pct.toFixed(2))}%)</span>
  </span>
);

const Card = ({ children, style }) => (
  <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, padding: "18px 20px", ...style }}>{children}</div>
);

const Eyebrow = ({ children, style }) => (
  <div style={{ fontSize: 11, letterSpacing: "0.12em", textTransform: "uppercase", color: T.inkSoft, marginBottom: 12, ...style }}>{children}</div>
);

const ChartTip = ({ active, payload, total }) => {
  if (!active || !payload?.length) return null;
  const p = payload[0];
  return (
    <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
      {p.name || p.payload.name || p.payload.m}: {usd(p.value)}{total ? ` · ${((p.value / total) * 100).toFixed(1)}%` : ""}
    </div>
  );
};

function CompositionCard({ title, data, total, donut, flex = 1 }) {
  const top = data.slice(0, 7);
  const rest = data.slice(7).reduce((s, d) => s + d.value, 0);
  const rows = rest > 0 ? [...top, { name: "Other", value: rest }] : top;
  return (
    <Card style={{ flex, minWidth: 260 }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ height: 185 }}>
        <ResponsiveContainer width="100%" height="100%">
          {donut ? (
            <PieChart>
              <Pie data={rows} dataKey="value" nameKey="name" innerRadius={46} outerRadius={76} paddingAngle={2} strokeWidth={0}>
                {rows.map((_, i) => <Cell key={i} fill={T.chart[i % T.chart.length]} />)}
              </Pie>
              <Tooltip content={<ChartTip total={total} />} />
            </PieChart>
          ) : (
            <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 8 }}>
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={110} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
              <Tooltip content={<ChartTip total={total} />} cursor={{ fill: "rgba(14,91,67,0.06)" }} />
              <Bar dataKey="value" radius={[0, 4, 4, 0]} barSize={14}>
                {rows.map((d, i) => <Cell key={i} fill={d.name === "ETFs (opaque)" ? "#B9C6BE" : T.chart[i % T.chart.length]} />)}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: "4px 14px" }}>
        {rows.map((d, i) => (
          <span key={d.name} style={{ fontSize: 11, color: T.inkSoft, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: d.name === "ETFs (opaque)" && !donut ? "#B9C6BE" : T.chart[i % T.chart.length] }} />
            {d.name} {((d.value / total) * 100).toFixed(0)}%
          </span>
        ))}
      </div>
    </Card>
  );
}

const Toggle = ({ on, setOn, label }) => (
  <button onClick={() => setOn(!on)} style={{
    display: "inline-flex", alignItems: "center", gap: 9, cursor: "pointer",
    background: on ? T.ledger : T.card, color: on ? "#fff" : T.ink,
    border: `1px solid ${on ? T.ledger : T.line}`, borderRadius: 999,
    padding: "7px 14px", fontFamily: "inherit", fontSize: 13, fontWeight: 500, transition: "all 160ms ease",
  }}>
    <span style={{ width: 26, height: 14, borderRadius: 999, background: on ? "#ffffff44" : T.line, position: "relative", display: "inline-block" }}>
      <span style={{ position: "absolute", top: 2, left: on ? 14 : 2, width: 10, height: 10, borderRadius: "50%", background: on ? "#fff" : T.inkSoft, transition: "left 160ms ease" }} />
    </span>
    {label}
  </button>
);

/* ------------------------------------------------------------------ */
/* Analytics helpers                                                   */
/* ------------------------------------------------------------------ */
const mergeBySym = (hs) => {
  const map = {};
  for (const h of hs) {
    if (!map[h.sym]) map[h.sym] = { ...h };
    else { map[h.sym].value += h.value; map[h.sym].cost += h.cost; }
  }
  return Object.values(map);
};

const LIQ_TIER = (h) =>
  h.cls === "Crypto" ? "24/7 · crypto"
    : h.sym === "Brex Treasury" || h.sym === "SGOV" ? "T+1 · treasury"
    : h.cls === "Cash" ? "Instant · checking"
    : "T+2 · market";

// Mock monthly allocation weights (%), drifting toward today's mix.
const DRIFT = NW_HISTORY.map((p, i, arr) => {
  const t = i / (arr.length - 1);
  const lerp = (a, b) => +(a + (b - a) * t).toFixed(1);
  return { m: p.m, Cash: lerp(46, 37.8), ETFs: lerp(35, 40.6), Stocks: lerp(13, 11.9), Crypto: lerp(6, 9.7) };
});

function SignedBarCard({ title, rows, fmtV, note }) {
  return (
    <Card style={{ flex: 1, minWidth: 300 }}>
      <Eyebrow>{title}</Eyebrow>
      <div style={{ height: 200 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} layout="vertical" margin={{ left: 0, right: 14 }}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={66} tickLine={false} axisLine={false} tick={{ fontSize: 11, fill: T.inkSoft, fontFamily: mono }} />
            <Tooltip cursor={{ fill: "rgba(14,91,67,0.06)" }} content={({ active, payload }) =>
              active && payload?.length ? (
                <div style={{ background: T.ink, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                  {payload[0].payload.name}: {fmtV(payload[0].value)}
                </div>
              ) : null} />
            <Bar dataKey="v" radius={[0, 4, 4, 0]} barSize={13}>
              {rows.map((d, i) => <Cell key={i} fill={d.v >= 0 ? T.gain : T.loss} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      {note && <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 6 }}>{note}</div>}
    </Card>
  );
}

function ConcentrationCard({ holdings, total }) {
  const top = mergeBySym(holdings).sort((a, b) => b.value - a.value).slice(0, 5);
  const share = top.reduce((s, h) => s + h.value, 0) / total;
  return (
    <Card style={{ flex: 1, minWidth: 300 }}>
      <Eyebrow>Concentration</Eyebrow>
      <div style={{ fontFamily: serif, fontSize: 30, fontWeight: 600 }}>{(share * 100).toFixed(0)}%<span style={{ fontSize: 14, color: T.inkSoft, fontFamily: "'Inter', sans-serif", fontWeight: 400 }}> of assets in top 5 positions</span></div>
      <div style={{ marginTop: 12 }}>
        {top.map((h) => (
          <div key={h.sym} style={{ marginBottom: 9 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
              <span style={{ fontWeight: 600 }}>{h.sym}</span>
              <span style={{ fontFamily: mono, color: T.inkSoft }}>{usd(h.value)} · {((h.value / total) * 100).toFixed(1)}%</span>
            </div>
            <div style={{ height: 7, background: "#EDF2EE", borderRadius: 4 }}>
              <div style={{ height: "100%", width: `${(h.value / total) * 100}%`, background: T.ledger, borderRadius: 4 }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function DriftCard() {
  const keys = ["Cash", "ETFs", "Stocks", "Crypto"];
  return (
    <Card style={{ marginTop: 16 }}>
      <Eyebrow>Allocation drift · 19 months (% of assets)</Eyebrow>
      <div style={{ height: 210 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={DRIFT} margin={{ left: 8, right: 8, top: 6 }}>
            <CartesianGrid stroke={T.line} vertical={false} />
            <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={2} />
            <YAxis unit="%" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} width={44} />
            <Tooltip formatter={(v, n) => [v + "%", n]} contentStyle={{ background: T.ink, border: "none", borderRadius: 6, fontFamily: mono, fontSize: 12 }} labelStyle={{ color: "#fff" }} itemStyle={{ color: "#fff" }} />
            {keys.map((k, i) => (
              <Area key={k} type="monotone" dataKey={k} stackId="1" stroke={T.chart[i]} fill={T.chart[i]} fillOpacity={0.55} />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
      <div style={{ marginTop: 8, display: "flex", gap: 14, flexWrap: "wrap" }}>
        {keys.map((k, i) => (
          <span key={k} style={{ fontSize: 11, color: T.inkSoft, fontFamily: mono, display: "inline-flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: T.chart[i] }} />{k}
          </span>
        ))}
        <span style={{ fontSize: 11, color: T.inkSoft, marginLeft: "auto" }}>Crypto quietly grew from 6% → ~10% — the kind of drift this chart exists to catch.</span>
      </div>
    </Card>
  );
}

/* ================================================================== */
/* TAB 1 · NET WORTH                                                   */
/* ================================================================== */
function NetWorthTab({ holdings, lookThrough, setLookThrough }) {
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const capital = holdings.filter((h) => h.pf === "capital").reduce((s, h) => s + h.value, 0);
  const personal = total - capital;
  const income = holdings.reduce((s, h) => s + (h.value * h.yld) / 100, 0);
  const byClass = aggregate(holdings, "class", false);
  const bySector = aggregate(holdings, "sector", lookThrough);
  const byGeo = aggregate(holdings, "geo", lookThrough);
  const incomeRows = holdings.filter((h) => h.yld > 0)
    .map((h) => ({ ...h, inc: (h.value * h.yld) / 100 })).sort((a, b) => b.inc - a.inc);

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
          {[["976 Capital", capital, T.ledger], ["Personal", personal, "#C09A5B"]].map(([n, v, c]) => (
            <div key={n} style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 10, height: 10, borderRadius: 3, background: c }} />{n}
              </span>
              <span style={{ fontFamily: mono }}>{usd(v)} <span style={{ color: T.inkSoft }}>· {((v / total) * 100).toFixed(1)}%</span></span>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", padding: "7px 0", fontSize: 13.5, color: T.loss }}>
            <span>Debts</span><span style={{ fontFamily: mono }}>−{usd(DEBTS).slice(1)}</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", padding: "9px 0 0", fontSize: 14, fontWeight: 600 }}>
            <span>Net worth</span><span style={{ fontFamily: mono }}>{usd(total - DEBTS)}</span>
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

      {/* Net worth evolution */}
      <Card style={{ marginTop: 16 }}>
        <Eyebrow>Net worth evolution · 19 months</Eyebrow>
        <div style={{ height: 220 }}>
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={NW_HISTORY} margin={{ left: 8, right: 8, top: 6 }}>
              <defs>
                <linearGradient id="nw" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.ledger} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={T.ledger} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={T.line} vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={2} />
              <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} width={52} domain={["dataMin - 60000", "dataMax + 40000"]} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="v" stroke={T.ledger} strokeWidth={2} fill="url(#nw)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

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

      {/* Analytics */}
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginTop: 30, marginBottom: 14 }}>Analytics</div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
        <ConcentrationCard holdings={holdings} total={total} />
        <SignedBarCard
          title="Day change attribution · top movers"
          rows={mergeBySym(holdings)
            .map((h) => ({ name: h.sym, v: Math.round((h.value * h.day) / 100) }))
            .filter((d) => d.v !== 0)
            .sort((a, b) => Math.abs(b.v) - Math.abs(a.v)).slice(0, 7)}
          fmtV={(v) => sign(v, usd(v))}
          note="Which positions actually moved the number today." />
      </div>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
        <CompositionCard title="Liquidity tiers" data={(() => {
          const m = {};
          holdings.forEach((h) => { const k = LIQ_TIER(h); m[k] = (m[k] || 0) + h.value; });
          return Object.entries(m).map(([name, value]) => ({ name, value: Math.round(value) })).sort((a, b) => b.value - a.value);
        })()} total={total} donut />
        <SignedBarCard
          title="Unrealized gain/loss ladder · %"
          rows={mergeBySym(holdings)
            .filter((h) => h.cls !== "Cash")
            .map((h) => ({ name: h.sym, v: +(((h.value - h.cost) / h.cost) * 100).toFixed(1) }))
            .sort((a, b) => b.v - a.v)}
          fmtV={(v) => sign(v, v + "%")}
          note="Bottom of the ladder doubles as a tax-loss-harvesting shortlist." />
      </div>
      <DriftCard />
    </div>
  );
}

/* ================================================================== */
/* TAB 2 · HOLDINGS (one flat, sortable, consolidated table)           */
/* ================================================================== */
function HoldingsTab({ holdings }) {
  const [pf, setPf] = useState("all");
  const [sort, setSort] = useState({ key: "value", dir: "desc" });
  const rows = holdings.filter((h) => pf === "all" || h.pf === pf);

  // Consolidate identical symbols held across accounts/portfolios
  const merged = useMemo(() => {
    const map = {};
    for (const h of rows) {
      if (!map[h.sym]) map[h.sym] = { ...h, sources: [] };
      else {
        const m = map[h.sym];
        m.day = (m.day * m.value + h.day * h.value) / (m.value + h.value);
        m.value += h.value; m.cost += h.cost;
      }
      map[h.sym].sources.push(`${h.acct}${h.pf === "capital" ? " · 976" : " · Personal"}`);
    }
    return Object.values(map).map((h) => ({
      ...h,
      klass: subclass(h),
      gain: h.cls === "Cash" ? 0 : h.value - h.cost,
      gainPct: h.cls === "Cash" ? 0 : ((h.value - h.cost) / h.cost) * 100,
    }));
  }, [rows]);

  const sorted = useMemo(() => {
    const arr = [...merged];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const av = a[key], bv = b[key];
      const cmp = typeof av === "string" ? av.localeCompare(bv) : av - bv;
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [merged, sort]);

  const total = merged.reduce((s, h) => s + h.value, 0);
  const clickSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  const COLS = [
    { key: "sym", label: "Asset", align: "left" },
    { key: "klass", label: "Class", align: "left" },
    { key: "cost", label: "Cost", align: "right" },
    { key: "value", label: "Value", align: "right" },
    { key: "day", label: "Day", align: "right" },
    { key: "gain", label: "Total gain", align: "right" },
  ];
  const grid = "2.2fr 0.8fr 1fr 1fr 1.2fr 1.4fr";

  const tabs = [["all", "All"], ["capital", "976 Capital"], ["personal", "Personal"]];
  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginTop: 18, borderBottom: `1px solid ${T.line}` }}>
        {tabs.map(([id, label]) => (
          <button key={id} onClick={() => setPf(id)} style={{
            background: "none", border: "none", cursor: "pointer", padding: "8px 14px 12px", fontFamily: "inherit",
            fontSize: 14, fontWeight: pf === id ? 600 : 400, color: pf === id ? T.ink : T.inkSoft,
            borderBottom: pf === id ? `2px solid ${T.ledger}` : "2px solid transparent", marginBottom: -1,
          }}>{label}</button>
        ))}
        <div style={{ marginLeft: "auto", alignSelf: "center", fontFamily: mono, fontSize: 12.5, color: T.inkSoft }}>{usd(total)}</div>
      </div>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 18, overflow: "hidden" }}>
        <div style={{ display: "grid", gridTemplateColumns: grid, padding: "0 20px", borderBottom: `1px solid ${T.line}`, background: "#F4F7F5" }}>
          {COLS.map((c) => {
            const active = sort.key === c.key;
            return (
              <button key={c.key} onClick={() => clickSort(c.key)} style={{
                background: "none", border: "none", cursor: "pointer", padding: "10px 0", fontFamily: "inherit",
                fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: active ? 700 : 500,
                color: active ? T.ledger : T.inkSoft, textAlign: c.align, display: "flex",
                justifyContent: c.align === "right" ? "flex-end" : "flex-start", alignItems: "center", gap: 4,
              }}>
                {c.label}
                <span style={{ fontSize: 8, opacity: active ? 1 : 0.35 }}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "▴▾"}</span>
              </button>
            );
          })}
        </div>
        {sorted.map((h) => {
          const dAmt = (h.value * h.day) / 100;
          const isCash = h.cls === "Cash";
          const multi = h.sources.length > 1;
          return (
            <div key={h.sym} className="row" style={{ display: "grid", gridTemplateColumns: grid, alignItems: "center", padding: "11px 20px", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {h.sym}
                  {multi && <span title={h.sources.join(" + ")} style={{ marginLeft: 7, fontSize: 9.5, fontFamily: mono, color: "#fff", background: T.ledger, borderRadius: 4, padding: "1.5px 6px", verticalAlign: "1px" }}>{h.sources.length} accts</span>}
                </div>
                <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>{multi ? h.sources.join("  +  ") : `${h.name} · ${h.sources[0]}`}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 11.5, color: h.klass === "ETFs" ? T.ledger : T.inkSoft }}>{h.klass}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12.5, color: T.inkSoft }}>{isCash ? "—" : usd(h.cost)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(h.value)}</div>
              <div style={{ textAlign: "right" }}>{h.day === 0 ? <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 12.5 }}>—</span> : <Delta pct={h.day} amt={dAmt} size={12.5} />}</div>
              <div style={{ textAlign: "right" }}>{isCash ? <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 12.5 }}>—</span> : <Delta pct={h.gainPct} amt={h.gain} size={12.5} />}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ================================================================== */
/* TAB 3 · SCENARIO PLANNING                                           */
/* ================================================================== */
const TARGETS = [3e6, 5e6, 10e6, 20e6];
const YEARS = [2030, 2035, 2040, 2045, 2050];
const monthsTo = (year) => (year - 2026) * 12 + 5; // Jul 2026 → Dec of year

function ScenarioTab({ startNW }) {
  const [mode, setMode] = useState("monthly"); // 'monthly' | 'return'
  const [assumedReturn, setAssumedReturn] = useState(7);
  const [assumedMonthly, setAssumedMonthly] = useState(5000);
  const [planMonthly, setPlanMonthly] = useState(5000);
  const [planReturn, setPlanReturn] = useState(7);

  const projection = useMemo(() => {
    const pts = [];
    for (let y = 2026; y <= 2050; y++) pts.push({ m: String(y), v: Math.round(fvCalc(startNW, planMonthly, planReturn / 100, Math.max(0, monthsTo(y)))) });
    return pts;
  }, [startNW, planMonthly, planReturn]);

  const inputStyle = { fontFamily: mono, fontSize: 14, padding: "8px 10px", border: `1px solid ${T.line}`, borderRadius: 8, width: 110, background: T.card, color: T.ink };
  const th = { padding: "10px 12px", fontSize: 10.5, letterSpacing: "0.1em", textTransform: "uppercase", color: T.inkSoft, textAlign: "right", borderBottom: `1px solid ${T.line}` };
  const td = { padding: "10px 12px", fontFamily: mono, fontSize: 13, textAlign: "right", borderBottom: `1px solid ${T.line}` };

  return (
    <div>
      {/* ---- Section 1: What it takes ---- */}
      <Card style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div style={{ fontFamily: serif, fontSize: 20, fontWeight: 600 }}>What it takes</div>
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>Starting from today's {usd(startNW)} net worth, monthly compounding.</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div style={{ display: "flex", border: `1px solid ${T.line}`, borderRadius: 8, overflow: "hidden" }}>
              {[["monthly", "Solve $/mo"], ["return", "Solve return"]].map(([id, label]) => (
                <button key={id} onClick={() => setMode(id)} style={{
                  border: "none", cursor: "pointer", padding: "8px 13px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 500,
                  background: mode === id ? T.ledger : T.card, color: mode === id ? "#fff" : T.inkSoft,
                }}>{label}</button>
              ))}
            </div>
            {mode === "monthly" ? (
              <label style={{ fontSize: 12.5, color: T.inkSoft, display: "inline-flex", alignItems: "center", gap: 7 }}>
                at return <input type="number" value={assumedReturn} min={0} max={30} step={0.5} onChange={(e) => setAssumedReturn(+e.target.value)} style={{ ...inputStyle, width: 70 }} /> %/yr
              </label>
            ) : (
              <label style={{ fontSize: 12.5, color: T.inkSoft, display: "inline-flex", alignItems: "center", gap: 7 }}>
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
                      return <td key={y} style={td}>{need <= 0 ? <span style={{ color: T.gain }}>on track ✓</span> : need > 200000 ? <span style={{ color: T.loss }}>&gt;$200k/mo</span> : `${usd(need)}/mo`}</td>;
                    }
                    const r = reqReturn(t, startNW, assumedMonthly, m);
                    return <td key={y} style={td}>{r === null ? <span style={{ color: T.loss }}>&gt;60%/yr</span> : r === 0 ? <span style={{ color: T.gain }}>on track ✓</span> : `${(r * 100).toFixed(1)}%/yr`}</td>;
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
            <div style={{ fontSize: 12.5, color: T.inkSoft, marginTop: 3 }}>Enter your plan; see where it lands.</div>
          </div>
          <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
            <label style={{ fontSize: 12.5, color: T.inkSoft, display: "inline-flex", alignItems: "center", gap: 7 }}>
              $<input type="number" value={planMonthly} min={0} step={500} onChange={(e) => setPlanMonthly(+e.target.value)} style={inputStyle} /> /mo
            </label>
            <label style={{ fontSize: 12.5, color: T.inkSoft, display: "inline-flex", alignItems: "center", gap: 7 }}>
              <input type="number" value={planReturn} min={-10} max={30} step={0.5} onChange={(e) => setPlanReturn(+e.target.value)} style={{ ...inputStyle, width: 70 }} /> %/yr
            </label>
          </div>
        </div>

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 18 }}>
          {YEARS.map((y) => {
            const v = fvCalc(startNW, planMonthly, planReturn / 100, monthsTo(y));
            const hit = TARGETS.filter((t) => v >= t).pop();
            return (
              <div key={y} style={{ flex: 1, minWidth: 130, border: `1px solid ${T.line}`, borderRadius: 8, padding: "12px 14px", background: "#FAFCFA" }}>
                <div style={{ fontSize: 11, letterSpacing: "0.1em", color: T.inkSoft, textTransform: "uppercase" }}>{y}</div>
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
                  <stop offset="0%" stopColor="#C09A5B" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#C09A5B" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={T.line} vertical={false} />
              <XAxis dataKey="m" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} interval={3} />
              <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.inkSoft, fontFamily: mono }} width={56} />
              <Tooltip content={<ChartTip />} />
              <Area type="monotone" dataKey="v" stroke="#C09A5B" strokeWidth={2} fill="url(#proj)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 8 }}>
          Deterministic compounding at a constant rate — a planning sketch, not a forecast. A real build could layer Monte Carlo bands here.
        </div>
      </Card>
    </div>
  );
}

/* ================================================================== */
/* App shell — with live price/dividend sync via Claude + web search   */
/* ================================================================== */
export default function App() {
  const [tab, setTab] = useState("networth");
  const [lookThrough, setLookThrough] = useState(true);
  const [live, setLive] = useState(null);   // { SYM: {price, day, yld} }
  const [syncing, setSyncing] = useState(false);
  const [syncErr, setSyncErr] = useState(null);
  const [asOf, setAsOf] = useState(null);
  const [auto, setAuto] = useState(true);

  const refresh = async () => {
    setSyncing(true); setSyncErr(null);
    const tickers = [...new Set(BASE_HOLDINGS.filter((h) => h.qty).map((h) => h.sym))];
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          messages: [{
            role: "user",
            content: `Look up the current market price in USD, today's percent change, and the forward annual dividend yield (percent) for each of these symbols: ${tickers.join(", ")}.
Notes: BTC, ETH, SOL, LINK are cryptocurrencies; HYPE is the Hyperliquid token; SPHQ, ILF, SGOV, VOO are ETFs (use their distribution yield); the rest are US stocks.
Respond with ONLY a raw JSON object, no markdown fences, no prose, mapping each symbol to {"price": number, "day": number, "yld": number}. Use 0 for yld when there is none. Prices should be your best current figure from search.`,
          }],
          tools: [{ type: "web_search_20250305", name: "web_search" }],
        }),
      });
      const data = await res.json();
      const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
      const m = text.replace(/```json|```/g, "").match(/\{[\s\S]*\}/);
      if (!m) throw new Error("no JSON found in response");
      const parsed = JSON.parse(m[0]);
      setLive(parsed);
      setAsOf(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      setSyncErr(String(e?.message || e));
    }
    setSyncing(false);
  };

  // Reprice qty-based holdings from live quotes; cash stays at synced balances.
  const holdings = useMemo(() => BASE_HOLDINGS.map((h) => {
    const q = h.qty ? live?.[h.sym] : null;
    if (!q || typeof q.price !== "number") return h;
    return {
      ...h,
      value: h.qty * q.price,
      day: typeof q.day === "number" ? q.day : h.day,
      yld: typeof q.yld === "number" ? q.yld : h.yld,
    };
  }), [live]);

  // Auto-sync: once on load, then every 10 minutes while the tab is open.
  useEffect(() => { refresh(); }, []);
  useEffect(() => {
    if (!auto) return;
    const id = setInterval(refresh, 10 * 60 * 1000);
    return () => clearInterval(id);
  }, [auto]);

  const total = holdings.reduce((s, h) => s + h.value, 0);
  const dayAmt = holdings.reduce((s, h) => s + (h.value * h.day) / 100, 0);
  const dayPct = (dayAmt / (total - dayAmt)) * 100;
  const startNW = total - DEBTS;

  const TABS = [["networth", "Net Worth"], ["holdings", "Holdings"], ["scenarios", "Scenario Planning"]];

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: "'Inter', system-ui, sans-serif", paddingBottom: 60 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,500;9..144,600&family=IBM+Plex+Mono:wght@400;500&family=Inter:wght@400;500;600&display=swap');
        *{box-sizing:border-box} ::selection{background:#0E5B4322}
        .row:hover{background:#F2F6F3}
        input:focus{outline:2px solid #0E5B4355; outline-offset:1px}
        button:focus-visible{outline:2px solid #0E5B43; outline-offset:2px}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.45}}
        @media(prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important}}`}</style>

      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.ledger, fontWeight: 600 }}>
            Basis <span style={{ color: T.inkSoft, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>· portfolio ledger</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: mono }}>
              {live ? `live · as of ${asOf}` : "screenshot data · Jul 28"}
            </span>
            <button onClick={refresh} disabled={syncing} style={{
              cursor: syncing ? "wait" : "pointer", background: live ? T.card : T.ledger,
              color: live ? T.ledger : "#fff", border: `1px solid ${T.ledger}`, borderRadius: 999,
              padding: "7px 15px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600,
              animation: syncing ? "pulse 1.2s infinite" : "none",
            }}>
              {syncing ? "Syncing…" : live ? "↻ Re-sync" : "↻ Sync live prices"}
            </button>
            <label style={{ fontSize: 12, color: T.inkSoft, display: "inline-flex", alignItems: "center", gap: 5, cursor: "pointer", fontFamily: mono }}>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ accentColor: "#0E5B43" }} />
              auto · 10m
            </label>
          </div>
        </div>
        {syncErr && <div style={{ marginTop: 10, fontSize: 12.5, color: T.loss, fontFamily: mono }}>Sync failed: {syncErr} — showing snapshot values.</div>}

        <div style={{ marginTop: 22, display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 54, lineHeight: 1, letterSpacing: "-0.01em" }}>{usd(startNW)}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: T.inkSoft, fontFamily: mono }}>net worth · {usd(total)} assets − {usd(DEBTS)} debts</div>
          </div>
          <div style={{ paddingBottom: 6 }}>
            <span style={{ fontSize: 11, color: T.inkSoft, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>1 day</span>
            <Delta pct={dayPct} amt={dayAmt} size={14} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, marginTop: 26, borderBottom: `1px solid ${T.line}` }}>
          {TABS.map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)} style={{
              background: "none", border: "none", cursor: "pointer", padding: "9px 16px 13px", fontFamily: "inherit",
              fontSize: 14.5, fontWeight: tab === id ? 600 : 400, color: tab === id ? T.ink : T.inkSoft,
              borderBottom: tab === id ? `2.5px solid ${T.ledger}` : "2.5px solid transparent", marginBottom: -1,
            }}>{label}</button>
          ))}
        </div>

        {tab === "networth" && <NetWorthTab holdings={holdings} lookThrough={lookThrough} setLookThrough={setLookThrough} />}
        {tab === "holdings" && <HoldingsTab holdings={holdings} />}
        {tab === "scenarios" && <ScenarioTab startNW={startNW} />}

        <div style={{ marginTop: 30, fontSize: 12, color: T.inkSoft, lineHeight: 1.6, borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
          Prototype seeded from your screenshots; (est.) rows, share counts, history, and drift are placeholders.
          "Sync live prices" reprices tickered holdings via Claude + web search — indicative quotes with a small delay,
          not exchange tick data. Cash balances stay at snapshot values until real account APIs are wired in
          (Brex + IBKR direct, Chase + Robinhood via Plaid; dividends from IBKR Flex / declared rates in production).
        </div>
      </div>
    </div>
  );
}
