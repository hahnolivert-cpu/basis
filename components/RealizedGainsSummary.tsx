import { useMemo } from "react";
import { T, mono, serif } from "@/lib/theme";
import { usd, sign } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import type { TransactionRow } from "@/app/api/transactions/route";

type Range = "all" | "ytd" | "month";
type Row = TransactionRow & { gainCents: number | null };
type PortfolioTotals = { gainsCents: number; lossesCents: number; sells: number; unknown: number };

function rangeStart(range: Range): string | null {
  const now = new Date();
  if (range === "ytd") return `${now.getFullYear()}-01-01`;
  if (range === "month") return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  return null;
}

function emptyTotals(): PortfolioTotals {
  return { gainsCents: 0, lossesCents: 0, sells: 0, unknown: 0 };
}

function PortfolioColumn({ label, totals }: { label: string; totals: PortfolioTotals }) {
  const netCents = totals.gainsCents + totals.lossesCents;
  return (
    <div>
      <div style={{ fontFamily: serif, fontSize: 15, fontWeight: 600, marginBottom: 10 }}>{label}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11.5, color: T.ink }}>Realized gains</span>
          <span style={{ fontFamily: mono, fontSize: 13.5, color: T.gain }}>{usd(totals.gainsCents / 100)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
          <span style={{ fontSize: 11.5, color: T.ink }}>Realized losses</span>
          <span style={{ fontFamily: mono, fontSize: 13.5, color: T.loss }}>{usd(totals.lossesCents / 100)}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", paddingTop: 8, borderTop: `1px solid ${T.line}` }}>
          <span style={{ fontSize: 11.5, fontWeight: 600, color: T.ink }}>Net</span>
          <span style={{ fontFamily: mono, fontSize: 14, fontWeight: 600, color: netCents >= 0 ? T.gain : T.loss }}>
            {sign(netCents / 100, usd(netCents / 100))}
          </span>
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: T.ink, marginTop: 10 }}>
        {totals.sells} sell{totals.sells === 1 ? "" : "s"}
        {totals.unknown > 0 && ` · ${totals.unknown} excluded (unknown cost basis)`}
      </div>
    </div>
  );
}

// Sits above the filterable transaction list — sums the same per-row
// realizedGainCents the table below already shows (from the API's
// average-cost calculation, app/api/transactions/route.ts), so this total
// always reconciles with what's in the table rather than being a second,
// possibly-drifting computation. Deliberately reads the full, unfiltered
// transaction list rather than whatever the table's own filters currently
// have selected — this has its own date range, independent of those.
export function RealizedGainsSummary({ transactions }: { transactions: Row[] }) {
  const [range, setRange] = usePersistedState<Range>("tx.realizedRange", "ytd");
  const from = useMemo(() => rangeStart(range), [range]);

  const { capital, personal } = useMemo(() => {
    const totals: { capital: PortfolioTotals; personal: PortfolioTotals } = { capital: emptyTotals(), personal: emptyTotals() };
    for (const t of transactions) {
      if (t.type !== "sell") continue;
      if (from && t.date < from) continue;
      const bucket = totals[t.portfolio];
      bucket.sells++;
      if (t.gainCents === null) {
        bucket.unknown++;
        continue;
      }
      if (t.gainCents >= 0) bucket.gainsCents += t.gainCents;
      else bucket.lossesCents += t.gainCents;
    }
    return totals;
  }, [transactions, from]);

  return (
    <Card style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <Eyebrow style={{ marginBottom: 0 }}>Realized gains &amp; losses</Eyebrow>
        <select
          value={range}
          onChange={(e) => setRange(e.target.value as Range)}
          style={{
            fontFamily: mono, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${T.line}`, borderRadius: 7,
            background: T.card, color: T.ink,
          }}
        >
          <option value="all">All time</option>
          <option value="ytd">YTD</option>
          <option value="month">Monthly</option>
        </select>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 24 }}>
        <PortfolioColumn label="976 Capital" totals={capital} />
        <PortfolioColumn label="Personal" totals={personal} />
      </div>
    </Card>
  );
}
