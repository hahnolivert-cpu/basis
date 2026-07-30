"use client";

import { useMemo, useState } from "react";
import { T, mono, serif } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Card, Eyebrow, Delta } from "@/components/ui";
import { formatTicker } from "@/lib/holdings";
import { mergeBySym } from "@/lib/calc";
import { useTransactions } from "@/lib/hooks/useTransactions";
import type { TransactionRow } from "@/app/api/transactions/route";
import type { Holding } from "@/lib/types";

type SortKey = "date" | "asset" | "portfolio" | "recurring" | "qty" | "buyPrice" | "currentPrice" | "totalBuy" | "totalCurrent" | "gainPct";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type AssetTypeFilter = "all" | "Stocks" | "ETFs" | "Crypto";
type PerformanceFilter = "all" | "winners" | "losers";
type RecurringFilter = "all" | "recurring" | "one-off";

type Row = TransactionRow & { currentPrice: number | null; currentValueCents: number | null; gainCents: number | null; gainPct: number | null };

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "date", label: "Date", align: "left" },
  { key: "asset", label: "Asset", align: "left" },
  { key: "portfolio", label: "Portfolio", align: "left" },
  { key: "recurring", label: "Recurring", align: "left" },
  { key: "qty", label: "Qty", align: "right" },
  { key: "buyPrice", label: "Buy price", align: "right" },
  { key: "currentPrice", label: "Current price", align: "right" },
  { key: "totalBuy", label: "Total buy", align: "right" },
  { key: "totalCurrent", label: "Total current", align: "right" },
  { key: "gainPct", label: "Gain since buy", align: "right" },
];
const GRID = "0.9fr 0.7fr 0.8fr 0.75fr 0.7fr 0.9fr 0.9fr 1fr 1.05fr 1.25fr";

// Filters default to the last 30 days across all asset classes — the most
// relevant slice for "what have I been buying recently."
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
};

const inputStyle = {
  fontFamily: mono, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${T.line}`, borderRadius: 7,
  background: T.card, color: T.ink,
};

const bucketOf = (t: TransactionRow): "Stocks" | "ETFs" | "Crypto" | "Cash" =>
  t.assetClass !== "Equities" ? (t.assetClass as "Crypto" | "Cash") : t.isEtf ? "ETFs" : "Stocks";

const EMPTY_TRANSACTIONS: TransactionRow[] = [];

export function TransactionsSection({ holdings }: { holdings: Holding[] }) {
  const { data, isLoading } = useTransactions();
  const raw = data?.transactions ?? EMPTY_TRANSACTIONS;

  const [dateFrom, setDateFrom] = useState(() => daysAgo(30));
  const [dateTo, setDateTo] = useState("");
  const [assetType, setAssetType] = useState<AssetTypeFilter>("all");
  const [assetQuery, setAssetQuery] = useState("");
  const [performance, setPerformance] = useState<PerformanceFilter>("all");
  const [recurring, setRecurring] = useState<RecurringFilter>("all");
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });

  // Current price per symbol from the live-repriced holdings the rest of the
  // dashboard already has — avoids a second round-trip to the quote APIs
  // just to answer "how has this purchase done since."
  const priceBySymbol = useMemo(() => {
    const map = new Map<string, number>();
    for (const h of mergeBySym(holdings)) {
      if (h.qty) map.set(h.sym, h.value / h.qty);
    }
    return map;
  }, [holdings]);

  const enriched = useMemo<Row[]>(
    () =>
      raw.map((t) => {
        const currentPrice = priceBySymbol.get(t.symbol) ?? null;
        const currentValueCents = currentPrice !== null ? Math.round(currentPrice * t.qty * 100) : null;
        const gainCents = currentValueCents !== null ? currentValueCents - t.totalCents : null;
        const gainPct = currentValueCents !== null && t.totalCents > 0 ? (gainCents! / t.totalCents) * 100 : null;
        return { ...t, currentPrice, currentValueCents, gainCents, gainPct };
      }),
    [raw, priceBySymbol]
  );

  const filtered = useMemo(
    () =>
      enriched.filter((t) => {
        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;
        if (assetType !== "all" && bucketOf(t) !== assetType) return false;
        if (assetQuery && !`${t.symbol} ${t.name}`.toLowerCase().includes(assetQuery.toLowerCase())) return false;
        if (performance === "winners" && !(t.gainPct !== null && t.gainPct > 0)) return false;
        if (performance === "losers" && !(t.gainPct !== null && t.gainPct < 0)) return false;
        if (recurring === "recurring" && !t.isRecurring) return false;
        if (recurring === "one-off" && t.isRecurring) return false;
        return true;
      }),
    [enriched, dateFrom, dateTo, assetType, assetQuery, performance, recurring]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    const val = (r: Row): number | string => {
      switch (key) {
        case "date": return r.date;
        case "asset": return r.symbol;
        case "portfolio": return r.portfolio;
        case "recurring": return r.isRecurring ? 1 : 0;
        case "qty": return r.qty;
        case "buyPrice": return r.priceCents;
        case "currentPrice": return r.currentPrice ?? -Infinity;
        case "totalBuy": return r.totalCents;
        case "totalCurrent": return r.currentValueCents ?? -Infinity;
        case "gainPct": return r.gainPct ?? -Infinity;
      }
    };
    arr.sort((a, b) => {
      const av = val(a), bv = val(b);
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [filtered, sort]);

  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "desc" }));

  const totalCostCents = sorted.reduce((s, t) => s + t.totalCents, 0);
  const totalCurrentCents = sorted.reduce((s, t) => s + (t.currentValueCents ?? 0), 0);
  const totalGainCents = totalCurrentCents - sorted.filter((t) => t.currentValueCents !== null).reduce((s, t) => s + t.totalCents, 0);
  const totalGainPct = totalCostCents > 0 ? (totalGainCents / sorted.filter((t) => t.currentValueCents !== null).reduce((s, t) => s + t.totalCents, 0)) * 100 : 0;

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginBottom: 14 }}>Transactions</div>

      <Card style={{ marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 10 }}>Filters</Eyebrow>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.inkSoft }}>
            From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.inkSoft }}>
            To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </label>
          <select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetTypeFilter)} style={inputStyle}>
            <option value="all">All asset types</option>
            <option value="Stocks">Stocks</option>
            <option value="ETFs">ETFs</option>
            <option value="Crypto">Crypto</option>
          </select>
          <input
            type="text"
            placeholder="Search asset…"
            value={assetQuery}
            onChange={(e) => setAssetQuery(e.target.value)}
            style={{ ...inputStyle, width: 140 }}
          />
          <select value={performance} onChange={(e) => setPerformance(e.target.value as PerformanceFilter)} style={inputStyle}>
            <option value="all">All performance</option>
            <option value="winners">Winners only</option>
            <option value="losers">Losers only</option>
          </select>
          <select value={recurring} onChange={(e) => setRecurring(e.target.value as RecurringFilter)} style={inputStyle}>
            <option value="all">Recurring + one-off</option>
            <option value="recurring">Recurring only</option>
            <option value="one-off">One-off only</option>
          </select>
        </div>
      </Card>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 900 }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "0 16px", borderBottom: `1px solid ${T.line}`, background: "#F4F7F5" }}>
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => clickSort(c.key)}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "8px 0", fontFamily: "inherit",
                      fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: active ? 700 : 500,
                      color: active ? T.ledger : T.inkSoft, textAlign: c.align, display: "flex",
                      justifyContent: c.align === "right" ? "flex-end" : "flex-start", alignItems: "center", gap: 4,
                    }}
                  >
                    {c.label}
                    <span style={{ fontSize: 8, opacity: active ? 1 : 0.35 }}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "▴▾"}</span>
                  </button>
                );
              })}
            </div>

            {isLoading && (
              <div style={{ padding: "16px", fontSize: 12.5, color: T.inkSoft, fontFamily: mono }}>Loading transactions…</div>
            )}
            {!isLoading && sorted.length === 0 && (
              <div style={{ padding: "16px", fontSize: 12.5, color: T.inkSoft, fontFamily: mono }}>
                {data?.error ? `Could not load transactions: ${data.error}` : "No buy transactions match these filters."}
              </div>
            )}

            {sorted.map((t, i) => (
              <div
                key={t.id}
                className={`row${i % 2 === 1 ? " row-alt" : ""}`}
                style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13 }}
              >
                <div style={{ fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{t.date}</div>
                <div style={{ fontFamily: mono, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.name}>
                  {formatTicker(t.symbol)}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: t.portfolio === "capital" ? T.ledger : "#C09A5B" }}>
                  {t.portfolio === "capital" ? "976 Capital" : "Personal"}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: t.isRecurring ? T.ink : T.inkSoft }}>{t.isRecurring ? "Yes" : "No"}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{t.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{usd(t.priceCents / 100, 2)}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>
                  {t.currentPrice !== null ? usd(t.currentPrice, 2) : <span>—</span>}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(t.totalCents / 100)}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12 }}>
                  {t.currentValueCents !== null ? usd(t.currentValueCents / 100) : <span style={{ color: T.inkSoft }}>closed</span>}
                </div>
                <div style={{ textAlign: "right" }}>
                  {t.gainPct !== null ? <Delta pct={t.gainPct} amt={t.gainCents! / 100} size={12} weight={600} /> : <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 12 }}>—</span>}
                </div>
              </div>
            ))}

            {sorted.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "10px 16px", background: "#EAF3EE", borderTop: `2px solid ${T.ledger}`, fontSize: 13, fontWeight: 600 }}>
                <div style={{ gridColumn: "1 / 4" }}>Total ({sorted.length})</div>
                <div />
                <div />
                <div />
                <div />
                <div style={{ textAlign: "right", fontFamily: mono }}>{usd(totalCostCents / 100)}</div>
                <div style={{ textAlign: "right", fontFamily: mono }}>{usd(totalCurrentCents / 100)}</div>
                <div style={{ textAlign: "right" }}>
                  <Delta pct={totalGainPct} amt={totalGainCents / 100} size={12.5} weight={700} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
