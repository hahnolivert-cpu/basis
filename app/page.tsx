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
import { useIsMobile } from "@/lib/hooks/useIsMobile";

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
  const isMobile = useIsMobile();
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
        {(() => {
          const logo = (
            <div style={{ display: "flex", alignItems: "center", gap: 9, flexShrink: 0 }}>
              {/* eslint-disable-next-line @next/next/no-img-element -- fixed local asset, not worth next/image's overhead for a 22px header mark */}
              <img src="/logo.png" alt="" width={22} height={22} style={{ display: "block" }} />
              <div style={{ fontSize: 13, letterSpacing: "0.18em", textTransform: "uppercase", color: T.gain, fontWeight: 600 }}>
                Ascentic
              </div>
            </div>
          );
          // minWidth: 0 is load-bearing — without it a flex item won't
          // shrink below its content's natural width, so on a narrow screen
          // the tabs would rather overflow the viewport (or wrap to a
          // second line) than actually use this div's own overflowX:auto.
          const tabs = (
            <div style={{ display: "flex", gap: 2, overflowX: "auto", minWidth: 0 }}>
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
          );
          // The data-freshness status now lives inside the Account menu
          // instead of sitting in the header, so this row is just the one
          // button — nothing left to overflow.
          const statusText = quotes
            ? `Live · as of ${new Date(quotes.asOf).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
            : "Screenshot data · Jul 28";
          const accountControls = <AccountMenu statusText={statusText} onSignOut={handleSignOut} />;

          // On mobile, the tabs get their own full-width row below the logo
          // — sharing a row with both the logo and the account controls left
          // them too cramped to be worth scrolling through.
          return isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                {logo}
                {accountControls}
              </div>
              {tabs}
            </div>
          ) : (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 12, paddingBottom: 14, borderBottom: `1px solid ${T.line}` }}>
              <div style={{ display: "flex", alignItems: "center", gap: 24, flexWrap: "nowrap", minWidth: 0 }}>
                {logo}
                {tabs}
              </div>
              {accountControls}
            </div>
          );
        })()}

        {/* One fluid layout instead of a hard mobile/desktop split — clamp()
            scales the numbers smoothly with viewport width, and flex-wrap
            lets the stat grid drop below the net worth figure on its own
            when there isn't room, rather than a fixed breakpoint jump. */}
        <Card style={{ marginTop: 22 }}>
          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "flex-start", justifyContent: "space-between", gap: "16px 24px" }}>
            <div>
              <Eyebrow style={{ marginBottom: 6 }}>Net worth</Eyebrow>
              <div style={{ fontFamily: serif, fontWeight: 600, fontSize: "clamp(26px, 7vw, 40px)", lineHeight: 1, letterSpacing: "-0.01em" }}>
                {usd(startNW)}
              </div>
            </div>
            {/* Equal-width columns (not organically sized to each label's
                content) so all three values start at the same point instead
                of drifting left/right depending on how wide "Daily" vs
                "All Time" happen to render. */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(70px, 1fr))", columnGap: 20, rowGap: 6, flex: "0 1 320px" }}>
              <Eyebrow style={{ marginBottom: 0 }}>Daily</Eyebrow>
              <Eyebrow style={{ marginBottom: 0 }}>All Time</Eyebrow>
              <Eyebrow style={{ marginBottom: 0 }}>IRR</Eyebrow>
              <Delta pct={dayPct} amt={dayAmt} size="clamp(12px, 2.4vw, 15px)" />
              <Delta pct={gainPct} amt={gainAmt} size="clamp(12px, 2.4vw, 15px)" />
              <div style={{ color: irr >= 0 ? T.gain : T.loss, fontFamily: mono, fontSize: "clamp(12px, 2.4vw, 15px)" }}>
                {sign(irr, irr.toFixed(1))}%/yr
              </div>
            </div>
          </div>
        </Card>

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
