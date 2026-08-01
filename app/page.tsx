"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { T, mono, serif, sans } from "@/lib/theme";
import { sign, usd } from "@/lib/format";
import { estIrr } from "@/lib/calc";

import { Delta, Card, Eyebrow } from "@/components/ui";
import { NetWorthTab } from "@/components/NetWorthTab";
import { HoldingsTab } from "@/components/HoldingsTab";
import { ScenarioTab } from "@/components/ScenarioTab";
import { TrackingTab } from "@/components/TrackingTab";
import { EarningsTab } from "@/components/EarningsTab";
import { AccountMenu } from "@/components/AccountMenu";
import { createClient } from "@/lib/supabase/client";
import { useQuotes } from "@/lib/hooks/useQuotes";
import { useEnrichedHoldings } from "@/lib/hooks/useEnrichedHoldings";
import { useLiabilities } from "@/lib/hooks/useLiabilities";
import { usePersistedState } from "@/lib/hooks/usePersistedState";

const TABS: [string, string][] = [
  ["networth", "Dashboard"],
  ["holdings", "Holdings"],
  ["tracking", "Tracking"],
  ["earnings", "Earnings"],
  ["scenarios", "Scenario Planning"],
];

export default function Home() {
  const router = useRouter();
  const [tab, setTab] = usePersistedState("app.tab", "networth");
  const [lookThrough, setLookThrough] = useState(true);
  const { data: quotes } = useQuotes();
  const { holdings } = useEnrichedHoldings();
  const { data: liabilityData } = useLiabilities();

  // A holding toggled out of net worth (e.g. a highly uncertain angel
  // investment) stays visible in the Holdings tab but drops out of net
  // worth and every chart — everything below reads this filtered list, not
  // the raw one. Holdings keeps the full list so the excluded row is still
  // there to toggle back on.
  const netWorthHoldings = useMemo(() => holdings.filter((h) => h.includedInNetWorth !== false), [holdings]);

  const total = netWorthHoldings.reduce((s, h) => s + h.value, 0);
  const dayAmt = netWorthHoldings.reduce((s, h) => s + (h.value * h.day) / 100, 0);
  const dayPct = (dayAmt / (total - dayAmt)) * 100;
  const debts = (liabilityData?.totalCents ?? 0) / 100;
  const startNW = total - debts;
  const inv = netWorthHoldings.filter((h) => h.cls !== "Cash");
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
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${T.line}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "wrap", rowGap: 10 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed local asset, not worth next/image's overhead for a 22px header mark */}
              <img src="/logo.png" alt="" width={22} height={22} style={{ display: "block" }} />
              <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gain, fontWeight: 600 }}>
                Ascentic
              </div>
            </div>
            <div style={{ display: "flex", gap: 2, overflowX: "auto" }}>
              {TABS.map(([id, label]) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    border: "none", cursor: "pointer", padding: "6px 12px", fontFamily: "inherit", borderRadius: 999,
                    fontSize: 13.5, fontWeight: tab === id ? 600 : 400,
                    background: tab === id ? T.gain : "none", color: tab === id ? "#fff" : T.inkSoft,
                    whiteSpace: "nowrap", flexShrink: 0,
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "nowrap" }}>
            <span style={{ fontSize: 12, color: T.inkSoft, fontFamily: mono, whiteSpace: "nowrap" }}>
              {quotes ? `live · as of ${new Date(quotes.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "screenshot data · Jul 28"}
            </span>
            <AccountMenu onSignOut={handleSignOut} />
          </div>
        </div>

        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 22 }}>
          <Card style={{ flex: 2, minWidth: 260 }}>
            <Eyebrow style={{ marginBottom: 6 }}>Net worth</Eyebrow>
            <div style={{ fontFamily: serif, fontWeight: 600, fontSize: "clamp(22px, 4.5vw, 28px)", lineHeight: 1, letterSpacing: "-0.01em" }}>{usd(startNW)}</div>
            <div style={{ marginTop: 8, fontSize: 13, color: T.inkSoft, fontFamily: mono }}>{usd(total)} assets − {usd(debts)} debts</div>
          </Card>
          <Card style={{ flex: 1, minWidth: 160, textAlign: "right" }}>
            <Eyebrow style={{ marginBottom: 6 }}>Daily</Eyebrow>
            <Delta pct={dayPct} amt={dayAmt} size={13} />
          </Card>
          <Card style={{ flex: 1, minWidth: 160, textAlign: "right" }}>
            <Eyebrow style={{ marginBottom: 6 }}>All Time</Eyebrow>
            <Delta pct={gainPct} amt={gainAmt} size={13} />
          </Card>
          <Card style={{ flex: 1, minWidth: 160, textAlign: "right" }}>
            <Eyebrow style={{ marginBottom: 6 }}>IRR</Eyebrow>
            <div style={{ color: irr >= 0 ? T.gain : T.loss, fontFamily: mono, fontSize: 13 }}>{sign(irr, irr.toFixed(1))}%/yr</div>
          </Card>
        </div>

        {tab === "networth" && (
          <NetWorthTab
            holdings={netWorthHoldings}
            debts={debts}
            liabilities={liabilityData?.liabilities ?? []}
            lookThrough={lookThrough}
            setLookThrough={setLookThrough}
          />
        )}
        {tab === "holdings" && <HoldingsTab holdings={holdings} />}
        {tab === "tracking" && <TrackingTab holdings={holdings} />}
        {tab === "earnings" && <EarningsTab holdings={netWorthHoldings} />}
        {tab === "scenarios" && <ScenarioTab startNW={startNW} holdings={netWorthHoldings} />}

        <div style={{ marginTop: 30, fontSize: 12, color: T.inkSoft, lineHeight: 1.6, borderTop: `1px solid ${T.line}`, paddingTop: 16 }}>
          Positions come from IBKR Flex, the Brex API, and Plaid (Chase, Robinhood); prices are live via Finnhub
          (stocks/ETFs) and CoinGecko (crypto), polled every 60s, with dividend yields from Polygon cached daily.
          Weekly history is real, imported from the spreadsheet and continued by the Sunday job, and debts are
          maintained in the liabilities table. Sector and geography read
          Unclassified where a provider doesn&apos;t label them, and ETF look-through only covers funds with
          constituent weights on file.
        </div>
      </div>
    </div>
  );
}
