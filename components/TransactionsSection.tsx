"use client";

import { useMemo, useState } from "react";
import { T, mono, serif } from "@/lib/theme";
import { usd, sign } from "@/lib/format";
import { Card, Eyebrow, Delta } from "@/components/ui";
import { formatTicker } from "@/lib/holdings";
import { mergeBySym } from "@/lib/calc";
import { useTransactions } from "@/lib/hooks/useTransactions";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import type { TransactionRow } from "@/app/api/transactions/route";
import type { Holding } from "@/lib/types";

type SortKey = "date" | "type" | "asset" | "portfolio" | "recurring" | "qty" | "buyPrice" | "currentPrice" | "totalBuy" | "totalCurrent" | "gainPct";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type AssetTypeFilter = "all" | "Stocks" | "ETFs" | "Crypto";
type PerformanceFilter = "all" | "winners" | "losers";
type RecurringFilter = "all" | "recurring" | "one-off";
type TradeTypeFilter = "all" | "buy" | "sell";

type Row = TransactionRow & { currentPrice: number | null; currentValueCents: number | null; gainCents: number | null; gainPct: number | null };

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "date", label: "Date", align: "left" },
  { key: "type", label: "Type", align: "left" },
  { key: "asset", label: "Asset", align: "left" },
  { key: "portfolio", label: "Portfolio", align: "left" },
  { key: "recurring", label: "Recurring", align: "left" },
  { key: "qty", label: "Qty", align: "right" },
  { key: "buyPrice", label: "Price", align: "right" },
  { key: "currentPrice", label: "Current price", align: "right" },
  { key: "totalBuy", label: "Total", align: "right" },
  { key: "totalCurrent", label: "Total current", align: "right" },
  { key: "gainPct", label: "Gain", align: "right" },
];
const GRID = "0.9fr 0.55fr 0.7fr 0.8fr 0.75fr 0.7fr 0.9fr 0.9fr 1fr 1.05fr 1.25fr";

// Filters default to year-to-date across all asset classes on first visit;
// after that, usePersistedState remembers whatever the user last set.
const startOfYear = () => `${new Date().getFullYear()}-01-01`;

const inputStyle = {
  fontFamily: mono, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${T.line}`, borderRadius: 7,
  background: T.card, color: T.ink,
};

const bucketOf = (t: TransactionRow): "Stocks" | "ETFs" | "Crypto" | "Cash" =>
  t.assetClass !== "Equities" ? (t.assetClass as "Crypto" | "Cash") : t.isEtf ? "ETFs" : "Stocks";

function TradeBadge({ type }: { type: "buy" | "sell" }) {
  return (
    <span
      style={{
        fontFamily: mono, fontSize: 10.5, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.04em",
        color: type === "buy" ? T.gain : T.loss,
      }}
    >
      {type}
    </span>
  );
}

const EMPTY_TRANSACTIONS: TransactionRow[] = [];

export function TransactionsSection({ holdings }: { holdings: Holding[] }) {
  const { data, isLoading } = useTransactions();
  const raw = data?.transactions ?? EMPTY_TRANSACTIONS;

  const [dateFrom, setDateFrom] = usePersistedState("tx.dateFrom", startOfYear());
  const [dateTo, setDateTo] = usePersistedState("tx.dateTo", "");
  const [assetType, setAssetType] = usePersistedState<AssetTypeFilter>("tx.assetType", "all");
  const [assetQuery, setAssetQuery] = usePersistedState("tx.assetQuery", "");
  const [performance, setPerformance] = usePersistedState<PerformanceFilter>("tx.performance", "all");
  const [recurring, setRecurring] = usePersistedState<RecurringFilter>("tx.recurring", "all");
  const [tradeType, setTradeType] = usePersistedState<TradeTypeFilter>("tx.tradeType", "all");
  const [sort, setSort] = usePersistedState<Sort>("tx.sort", { key: "date", dir: "desc" });
  const isMobile = useIsMobile();
  const [expandedId, setExpandedId] = useState<string | null>(null);

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

  // A buy's gain is unrealized — proceeds if sold at today's price, vs its
  // own cost. A sell has already realized its outcome, so it shows the
  // realized gain/loss from the API's average-cost-basis calculation
  // instead (null when there wasn't enough tracked buy history to know that
  // sale's cost basis) — comparing its proceeds to the current price of
  // whatever's left of that symbol would just be a different, misleading
  // number.
  const enriched = useMemo<Row[]>(
    () =>
      raw.map((t) => {
        if (t.type === "buy") {
          const currentPrice = priceBySymbol.get(t.symbol) ?? null;
          const currentValueCents = currentPrice !== null ? Math.round(currentPrice * t.qty * 100) : null;
          const gainCents = currentValueCents !== null ? currentValueCents - t.totalCents : null;
          const gainPct = currentValueCents !== null && t.totalCents > 0 ? (gainCents! / t.totalCents) * 100 : null;
          return { ...t, currentPrice, currentValueCents, gainCents, gainPct };
        }
        const gainCents = t.realizedGainCents;
        const costBasisCents = gainCents !== null ? t.totalCents - gainCents : null;
        const gainPct = gainCents !== null && costBasisCents !== null && costBasisCents > 0 ? (gainCents / costBasisCents) * 100 : null;
        return { ...t, currentPrice: null, currentValueCents: null, gainCents, gainPct };
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
        if (tradeType !== "all" && t.type !== tradeType) return false;
        if (performance === "winners" && !(t.gainPct !== null && t.gainPct > 0)) return false;
        if (performance === "losers" && !(t.gainPct !== null && t.gainPct < 0)) return false;
        if (recurring === "recurring" && !t.isRecurring) return false;
        if (recurring === "one-off" && t.isRecurring) return false;
        return true;
      }),
    [enriched, dateFrom, dateTo, assetType, assetQuery, tradeType, performance, recurring]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    const val = (r: Row): number | string => {
      switch (key) {
        case "date": return r.date;
        case "type": return r.type;
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

  // Sell proceeds aren't cost basis — summing them into "Total" alongside
  // buys would inflate it with money that came back out, not money put in.
  const totalCostCents = sorted.filter((t) => t.type === "buy").reduce((s, t) => s + t.totalCents, 0);
  const totalCurrentCents = sorted.reduce((s, t) => s + (t.currentValueCents ?? 0), 0);
  const totalGainCents = totalCurrentCents - sorted.filter((t) => t.currentValueCents !== null).reduce((s, t) => s + t.totalCents, 0);
  const totalGainPct = totalCostCents > 0 ? (totalGainCents / sorted.filter((t) => t.currentValueCents !== null).reduce((s, t) => s + t.totalCents, 0)) * 100 : 0;

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginBottom: 14 }}>Transactions</div>

      <Card style={{ marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 10 }}>Filters</Eyebrow>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.ink }}>
            From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.ink }}>
            To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </label>
          <select value={assetType} onChange={(e) => setAssetType(e.target.value as AssetTypeFilter)} style={inputStyle}>
            <option value="all">All asset types</option>
            <option value="Stocks">Stocks</option>
            <option value="ETFs">ETFs</option>
            <option value="Crypto">Crypto</option>
          </select>
          <select value={tradeType} onChange={(e) => setTradeType(e.target.value as TradeTypeFilter)} style={inputStyle}>
            <option value="all">Buys + sells</option>
            <option value="buy">Buys only</option>
            <option value="sell">Sells only</option>
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
        {isLoading && (
          <div style={{ padding: "16px", fontSize: 12.5, color: T.ink, fontFamily: mono }}>Loading transactions…</div>
        )}
        {!isLoading && sorted.length === 0 && (
          <div style={{ padding: "16px", fontSize: 12.5, color: T.ink, fontFamily: mono }}>
            {data?.error ? `Could not load transactions: ${data.error}` : "No transactions match these filters."}
          </div>
        )}
        {isMobile ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${T.line}`, background: T.headerBg }}>
              <select
                value={sort.key}
                onChange={(e) => clickSort(e.target.value as SortKey)}
                style={{ fontFamily: "inherit", fontSize: 11, color: T.ink, background: "none", border: `1px solid ${T.line}`, borderRadius: 6, padding: "4px 6px" }}
              >
                {COLS.map((c) => (
                  <option key={c.key} value={c.key}>
                    Sort: {c.label}
                  </option>
                ))}
              </select>
              <button
                onClick={() => setSort((s) => ({ ...s, dir: s.dir === "asc" ? "desc" : "asc" }))}
                style={{ fontFamily: "inherit", fontSize: 11, color: T.ink, background: "none", border: `1px solid ${T.line}`, borderRadius: 6, padding: "4px 8px", cursor: "pointer" }}
              >
                {sort.dir === "asc" ? "▲ asc" : "▼ desc"}
              </button>
            </div>
            {sorted.map((t) => {
              const expanded = expandedId === t.id;
              return (
                <div key={t.id}>
                  <div
                    onClick={() => setExpandedId(expanded ? null : t.id)}
                    style={{
                      display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10,
                      padding: "13px 14px", borderBottom: expanded ? "none" : `1px solid ${T.line}`, cursor: "pointer",
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        <TradeBadge type={t.type} />
                        <span style={{ fontFamily: mono, fontWeight: 700, color: T.gain, fontSize: 14.5 }}>{formatTicker(t.symbol)}</span>
                        <span
                          aria-hidden
                          style={{
                            display: "inline-flex", alignItems: "center", justifyContent: "center",
                            width: 18, height: 18, borderRadius: "50%", background: T.headerBg, color: T.inkSoft, fontSize: 9,
                            transform: expanded ? "rotate(180deg)" : "none", transition: "transform 150ms ease",
                          }}
                        >
                          ▾
                        </span>
                      </span>
                      <div style={{ fontSize: 11.5, color: t.portfolio === "capital" ? T.gain : T.inkSoft, marginTop: 2 }}>
                        {t.portfolio === "capital" ? "976 Capital" : "Personal"} · {t.date}
                      </div>
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: mono, fontWeight: 600, fontSize: 14.5 }}>{usd(t.totalCents / 100)}</div>
                      <div style={{ fontSize: 11.5, fontFamily: mono, marginTop: 2, color: t.gainPct === null ? T.inkSoft : t.gainPct >= 0 ? T.gain : T.loss }}>
                        {t.gainPct === null ? "—" : `${sign(t.gainCents! / 100, usd(t.gainCents! / 100))} · ${sign(t.gainPct, t.gainPct.toFixed(2))}%`}
                      </div>
                    </div>
                  </div>
                  {expanded && (
                    <div style={{ padding: "0 14px 14px", borderBottom: `1px solid ${T.line}`, background: T.subtleBg }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 9, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>Qty</div>
                          <div style={{ fontFamily: mono, fontSize: 12, marginTop: 2 }}>{t.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>Price</div>
                          <div style={{ fontFamily: mono, fontSize: 12, marginTop: 2 }}>{usd(t.priceCents / 100, 2)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {t.type === "buy" ? "Current price" : "Recurring"}
                          </div>
                          <div style={{ fontFamily: mono, fontSize: 12, marginTop: 2 }}>
                            {t.type === "buy" ? (t.currentPrice !== null ? usd(t.currentPrice, 2) : "—") : t.isRecurring ? "Yes" : "No"}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                        <div>
                          <div style={{ fontSize: 9, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {t.type === "buy" ? "Total current" : "Cost basis sold"}
                          </div>
                          <div style={{ fontFamily: mono, fontSize: 12, marginTop: 2 }}>
                            {t.type === "buy"
                              ? t.currentValueCents !== null
                                ? usd(t.currentValueCents / 100)
                                : "closed"
                              : t.gainCents !== null
                                ? usd((t.totalCents - t.gainCents) / 100)
                                : "—"}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 9, color: T.inkSoft, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                            {t.type === "buy" ? "Gain" : "Realized gain"}
                          </div>
                          <div style={{ marginTop: 2 }}>
                            {t.gainPct !== null ? (
                              <Delta pct={t.gainPct} amt={t.gainCents! / 100} size={12} weight={600} />
                            ) : (
                              <span style={{ fontFamily: mono, fontSize: 12, color: T.inkSoft }}>—</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {sorted.length > 0 && (
              <div style={{ padding: "12px 14px", background: T.tint, borderTop: `2px solid ${T.gain}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Total ({sorted.length})</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total (buys)</div>
                    <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 500 }}>{usd(totalCostCents / 100)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total current</div>
                    <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 500 }}>{usd(totalCurrentCents / 100)}</div>
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Unrealized gain (buys)</div>
                  <Delta pct={totalGainPct} amt={totalGainCents / 100} size={12} weight={600} />
                </div>
              </div>
            )}
          </>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 950 }}>
            <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "0 16px", borderBottom: `1px solid ${T.line}`, background: T.headerBg }}>
              {COLS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <button
                    key={c.key}
                    onClick={() => clickSort(c.key)}
                    style={{
                      background: "none", border: "none", cursor: "pointer", padding: "8px 0", fontFamily: "inherit",
                      fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase", fontWeight: active ? 700 : 500,
                      color: active ? T.gain : T.ink, textAlign: c.align, display: "flex",
                      justifyContent: c.align === "right" ? "flex-end" : "flex-start", alignItems: "center", gap: 4,
                    }}
                  >
                    {c.label}
                    <span style={{ fontSize: 8, opacity: active ? 1 : 0.35 }}>{active ? (sort.dir === "asc" ? "▲" : "▼") : "▴▾"}</span>
                  </button>
                );
              })}
            </div>

            {sorted.map((t, i) => (
              <div
                key={t.id}
                className={`row${i % 2 === 1 ? " row-alt" : ""}`}
                style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13 }}
              >
                <div style={{ fontFamily: mono, fontSize: 12, color: T.ink }}>{t.date}</div>
                <div>
                  <TradeBadge type={t.type} />
                </div>
                <div style={{ fontFamily: mono, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.name}>
                  {formatTicker(t.symbol)}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: t.portfolio === "capital" ? T.gain : T.ink }}>
                  {t.portfolio === "capital" ? "976 Capital" : "Personal"}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: t.isRecurring ? T.ink : T.ink }}>{t.isRecurring ? "Yes" : "No"}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.ink }}>{t.qty.toLocaleString("en-US", { maximumFractionDigits: 4 })}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.ink }}>{usd(t.priceCents / 100, 2)}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.ink }}>
                  {t.currentPrice !== null ? usd(t.currentPrice, 2) : <span>—</span>}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(t.totalCents / 100)}</div>
                <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12 }}>
                  {t.currentValueCents !== null ? (
                    usd(t.currentValueCents / 100)
                  ) : (
                    <span style={{ color: T.ink }}>{t.type === "sell" ? "—" : "closed"}</span>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  {t.gainPct !== null ? <Delta pct={t.gainPct} amt={t.gainCents! / 100} size={12} weight={600} /> : <span style={{ color: T.ink, fontFamily: mono, fontSize: 12 }}>—</span>}
                </div>
              </div>
            ))}

            {sorted.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "10px 16px", background: T.tint, borderTop: `2px solid ${T.gain}`, fontSize: 13 }}>
                <div style={{ gridColumn: "1 / 5" }}>Total ({sorted.length})</div>
                <div />
                <div />
                <div />
                <div />
                <div style={{ textAlign: "right", fontFamily: mono }} title="Buys only — sell proceeds aren't cost basis">{usd(totalCostCents / 100)}</div>
                <div style={{ textAlign: "right", fontFamily: mono }}>{usd(totalCurrentCents / 100)}</div>
                <div style={{ textAlign: "right" }} title="Unrealized gain on buys only — realized gains from sells aren't summed here">
                  <Delta pct={totalGainPct} amt={totalGainCents / 100} size={12} weight={600} />
                </div>
              </div>
            )}
          </div>
        </div>
        )}
      </div>
    </div>
  );
}
