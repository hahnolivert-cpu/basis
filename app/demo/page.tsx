"use client";

import { useState } from "react";
import { T, mono, serif, sans } from "@/lib/theme";
import { sign, usd } from "@/lib/format";
import { estIrr } from "@/lib/calc";
import Link from "next/link";

import { Delta, Card, Eyebrow } from "@/components/ui";
import { NetWorthTab } from "@/components/NetWorthTab";
import { HoldingsTab } from "@/components/HoldingsTab";
import { ScenarioTab } from "@/components/ScenarioTab";
import { TrackingTab } from "@/components/TrackingTab";
import { DEMO_HOLDINGS, DEMO_LIABILITIES, DEMO_DEBTS_CENTS, DEMO_WEEKLY_ROWS, DEMO_SNAPSHOTS, DEMO_TRANSACTIONS } from "@/lib/demoData";

const TABS: [string, string][] = [
  ["networth", "Net Worth"],
  ["holdings", "Holdings"],
  ["tracking", "Tracking"],
  ["scenarios", "Scenario Planning"],
];

// Public, unauthenticated showcase of the real UI fed entirely by lib/demoData.ts.
// No SWR hooks, no Supabase calls — nothing here can leak the real portfolio.
export default function DemoPage() {
  const [tab, setTab] = useState("networth");
  const [lookThrough, setLookThrough] = useState(true);

  const holdings = DEMO_HOLDINGS;
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const dayAmt = holdings.reduce((s, h) => s + (h.value * h.day) / 100, 0);
  const dayPct = (dayAmt / (total - dayAmt)) * 100;
  const debts = DEMO_DEBTS_CENTS / 100;
  const startNW = total - debts;
  const inv = holdings.filter((h) => h.cls !== "Cash");
  const invVal = inv.reduce((s, h) => s + h.value, 0);
  const invCost = inv.reduce((s, h) => s + h.cost, 0);
  const gainAmt = invVal - invCost;
  const gainPct = (gainAmt / invCost) * 100;
  const irr = estIrr(invVal, invCost, 19);

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: sans, paddingBottom: 60 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- fixed local asset, not worth next/image's overhead for a 22px header mark */}
            <img src="/logo.png" alt="" width={22} height={22} style={{ display: "block" }} />
            <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.ledger, fontWeight: 600 }}>
              Ascendia
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span
              style={{
                fontSize: 12, color: T.ledger, fontFamily: mono, fontWeight: 600, letterSpacing: "0.08em",
                border: `1px solid ${T.ledger}`, borderRadius: 999, padding: "6px 13px",
              }}
            >
              DEMO · sample data
            </span>
            <Link
              href="/login"
              style={{
                fontSize: 12, color: T.inkSoft, fontFamily: mono, textDecoration: "none",
                border: `1px solid ${T.line}`, borderRadius: 999, padding: "6px 13px",
              }}
            >
              Sign in
            </Link>
          </div>
        </div>

        <Card style={{ marginTop: 22, padding: "26px 28px" }}>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", flexWrap: "wrap", gap: 24 }}>
            <div>
              <Eyebrow style={{ marginBottom: 6 }}>Net worth</Eyebrow>
              <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 54, lineHeight: 1, letterSpacing: "-0.01em" }}>{usd(startNW)}</div>
              <div style={{ marginTop: 8, fontSize: 13, color: T.inkSoft, fontFamily: mono }}>{usd(total)} assets − {usd(debts)} debts</div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap" }}>
              <div style={{ padding: "0 22px 0 0", display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.1em" }}>1 day</span>
                <Delta pct={dayPct} amt={dayAmt} size={15} />
              </div>
              <div style={{ padding: "0 22px", borderLeft: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.1em" }}>Invested · all time</span>
                <Delta pct={gainPct} amt={gainAmt} size={15} />
              </div>
              <div style={{ padding: "0 0 0 22px", borderLeft: `1px solid ${T.line}`, display: "flex", flexDirection: "column", gap: 6 }}>
                <span style={{ fontSize: 10.5, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.1em" }}>IRR · est. annualized</span>
                <span style={{ color: irr >= 0 ? T.gain : T.loss, fontFamily: mono, fontSize: 15 }}>{sign(irr, irr.toFixed(1))}%/yr</span>
              </div>
            </div>
          </div>
        </Card>

        <div style={{ display: "flex", gap: 4, marginTop: 26, borderBottom: `1px solid ${T.line}` }}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: "9px 16px 13px", fontFamily: "inherit",
                fontSize: 14.5, fontWeight: tab === id ? 600 : 400, color: tab === id ? T.ink : T.inkSoft,
                borderBottom: tab === id ? `2.5px solid ${T.ledger}` : "2.5px solid transparent", marginBottom: -1,
              }}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === "networth" && (
          <NetWorthTab
            holdings={holdings}
            debts={debts}
            liabilities={DEMO_LIABILITIES}
            lookThrough={lookThrough}
            setLookThrough={setLookThrough}
            capitalLabel="Capital"
            demoSnapshots={DEMO_SNAPSHOTS}
          />
        )}
        {tab === "holdings" && (
          <HoldingsTab holdings={holdings} capitalLabel="Capital" demoTransactions={DEMO_TRANSACTIONS} />
        )}
        {tab === "tracking" && <TrackingTab demoRows={DEMO_WEEKLY_ROWS} />}
        {tab === "scenarios" && <ScenarioTab startNW={startNW} holdings={holdings} />}

        <div style={{ marginTop: 30, fontSize: 12, color: T.inkSoft, lineHeight: 1.6, borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
          This is a demo with entirely fictional holdings, balances, and history — no real account or provider is
          connected. <Link href="/login" style={{ color: T.ledger }}>Sign in</Link> to see your own portfolio.
        </div>
      </div>
    </div>
  );
}
