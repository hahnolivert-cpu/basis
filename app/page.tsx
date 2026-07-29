"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { T, mono, serif, sans } from "@/lib/theme";
import { sign, usd } from "@/lib/format";
import { estIrr } from "@/lib/calc";
import { BASE_HOLDINGS, DEBTS } from "@/lib/data";
import { Delta } from "@/components/ui";
import { NetWorthTab } from "@/components/NetWorthTab";
import { HoldingsTab } from "@/components/HoldingsTab";
import { ScenarioTab } from "@/components/ScenarioTab";
import { TrackingTab } from "@/components/TrackingTab";
import { createClient } from "@/lib/supabase/client";
import { useQuotes } from "@/lib/hooks/useQuotes";
import { useDividends } from "@/lib/hooks/useDividends";

const TABS: [string, string][] = [
  ["networth", "Net Worth"],
  ["holdings", "Holdings"],
  ["tracking", "Tracking"],
  ["scenarios", "Scenario Planning"],
];

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = useState("networth");
  const [lookThrough, setLookThrough] = useState(true);
  const { data: quotes } = useQuotes();
  const { data: dividends } = useDividends();

  // Reprice qty-based holdings from live quotes; cash stays at snapshot
  // values until Brex/Plaid are wired in. Yield comes from the daily Polygon
  // cache for equities/ETFs where available.
  const holdings = useMemo(
    () =>
      BASE_HOLDINGS.map((h) => {
        const q = h.qty ? quotes?.quotes[h.sym] : undefined;
        const yld = dividends?.yields[h.sym];
        return {
          ...h,
          value: q ? h.qty! * q.price : h.value,
          day: q ? q.day : h.day,
          yld: yld ?? h.yld,
        };
      }),
    [quotes, dividends]
  );
  const total = holdings.reduce((s, h) => s + h.value, 0);
  const dayAmt = holdings.reduce((s, h) => s + (h.value * h.day) / 100, 0);
  const dayPct = (dayAmt / (total - dayAmt)) * 100;
  const startNW = total - DEBTS;
  const inv = holdings.filter((h) => h.cls !== "Cash");
  const invVal = inv.reduce((s, h) => s + h.value, 0);
  const invCost = inv.reduce((s, h) => s + h.cost, 0);
  const gainAmt = invVal - invCost;
  const gainPct = (gainAmt / invCost) * 100;
  const irr = estIrr(invVal, invCost, 19);

  const handleSignOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: sans, paddingBottom: 60 }}>
      <div style={{ maxWidth: 1080, margin: "0 auto", padding: "34px 24px 0" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.ledger, fontWeight: 600 }}>
            Basis <span style={{ color: T.inkSoft, fontWeight: 400, letterSpacing: 0, textTransform: "none" }}>· portfolio ledger</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: mono }}>
              {quotes ? `live · as of ${new Date(quotes.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "screenshot data · Jul 28"}
            </span>
            <button
              onClick={handleSignOut}
              style={{
                background: "none", cursor: "pointer", border: `1px solid ${T.line}`, borderRadius: 999,
                padding: "6px 13px", fontFamily: "inherit", fontSize: 12, color: T.inkSoft,
              }}
            >
              Sign out
            </button>
          </div>
        </div>

        <div style={{ marginTop: 22, display: "flex", alignItems: "flex-end", gap: 22, flexWrap: "wrap" }}>
          <div>
            <div style={{ fontFamily: serif, fontWeight: 600, fontSize: 54, lineHeight: 1, letterSpacing: "-0.01em" }}>{usd(startNW)}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: T.inkSoft, fontFamily: mono }}>net worth · {usd(total)} assets − {usd(DEBTS)} debts</div>
          </div>
          <div style={{ paddingBottom: 6, display: "flex", flexDirection: "column", gap: 4 }}>
            <div>
              <span style={{ fontSize: 11, color: T.inkSoft, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>1 day</span>
              <Delta pct={dayPct} amt={dayAmt} size={13.5} />
            </div>
            <div>
              <span style={{ fontSize: 11, color: T.inkSoft, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>Invested · all time</span>
              <Delta pct={gainPct} amt={gainAmt} size={13.5} />
            </div>
            <div>
              <span style={{ fontSize: 11, color: T.inkSoft, marginRight: 8, textTransform: "uppercase", letterSpacing: "0.1em" }}>IRR · est. annualized</span>
              <span style={{ color: irr >= 0 ? T.gain : T.loss, fontFamily: mono, fontSize: 13.5 }}>{sign(irr, irr.toFixed(1))}%/yr</span>
            </div>
          </div>
        </div>

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

        {tab === "networth" && <NetWorthTab holdings={holdings} lookThrough={lookThrough} setLookThrough={setLookThrough} />}
        {tab === "holdings" && <HoldingsTab holdings={holdings} />}
        {tab === "tracking" && <TrackingTab />}
        {tab === "scenarios" && <ScenarioTab startNW={startNW} />}

        <div style={{ marginTop: 30, fontSize: 12, color: T.inkSoft, lineHeight: 1.6, borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
          Prices are live via Finnhub (stocks/ETFs) and CoinGecko (crypto), polled every 60s; dividend yields are
          from Polygon, cached daily. Share counts, history, and drift are still (est.) placeholders. Cash balances
          stay at snapshot values until real account APIs are wired in (Brex + IBKR direct, Chase + Robinhood via
          Plaid).
        </div>
      </div>
    </div>
  );
}
