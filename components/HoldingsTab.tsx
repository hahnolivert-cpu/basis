"use client";

import { useMemo, useState } from "react";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Delta } from "@/components/ui";
import { ManualPositions } from "@/components/ManualPositions";
import { TransactionsSection } from "@/components/TransactionsSection";
import { formatTicker } from "@/lib/holdings";
import type { Holding, Portfolio } from "@/lib/types";

type SortKey = "sym" | "cost" | "value" | "pct" | "yld" | "day" | "gain";
type Sort = { key: SortKey; dir: "asc" | "desc" };
// sourceCount, not the source list itself — the row shows a merge count, not
// which institutions hold it, per the "don't show where it's stored" ask.
// dayAmt is the dollar day change, kept alongside `day` (the % figure
// Holding already carries) so the Day column can sort on the dollar move
// rather than the percent one.
type Row = Holding & { gain: number; gainPct: number; pct: number; dayAmt: number; sourceCount: number };

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "sym", label: "Symbol", align: "left" },
  { key: "cost", label: "Cost", align: "right" },
  { key: "value", label: "Value", align: "right" },
  { key: "pct", label: "Exposure", align: "right" },
  { key: "yld", label: "Yield", align: "right" },
  { key: "day", label: "Day", align: "right" },
  { key: "gain", label: "Total gain", align: "right" },
];
// Symbol gets the extra room for a ticker + company name stack; every other
// column is the same width.
const GRID = "2.2fr 1fr 1fr 1fr 1fr 1fr 1fr";
// Every row is this height regardless of content — a merged multi-source
// symbol no longer grows a second line, so rows stay uniform.
const ROW_HEIGHT = 44;
export function HoldingsTab({ holdings }: { holdings: Holding[] }) {
  const TABS: [string, string][] = [
    ["all", "All"],
    ["capital", "976 Capital"],
    ["personal", "Personal"],
    ["transactions", "Transactions"],
  ];
  const [pf, setPf] = useState<"all" | Portfolio | "transactions">("all");
  const [sort, setSort] = useState<Sort>({ key: "value", dir: "desc" });

  // Cash consolidates into a single row regardless of symbol (Brex Treasury,
  // IBKR Cash, Chase checking, ...) — the ledger doesn't need per-account cash
  // lines, just the total. Everything else still merges by symbol, so the same
  // stock held at two brokers is one row.
  const merged = useMemo<Row[]>(() => {
    const rows = pf === "transactions" ? [] : holdings.filter((h) => pf === "all" || h.pf === pf);
    const bySymbol: Record<string, Holding & { sourceCount: number }> = {};
    let cash: (Holding & { sourceCount: number }) | null = null;

    for (const h of rows) {
      if (h.cls === "Cash") {
        if (!cash) {
          cash = { ...h, sym: "Cash", name: "Cash", sourceCount: 1 };
        } else {
          cash.yld = (cash.yld * cash.value + h.yld * h.value) / (cash.value + h.value);
          cash.value += h.value;
          cash.cost += h.cost;
          cash.sourceCount += 1;
        }
        continue;
      }
      if (!bySymbol[h.sym]) {
        bySymbol[h.sym] = { ...h, sourceCount: 1 };
      } else {
        const m = bySymbol[h.sym];
        m.day = (m.day * m.value + h.day * h.value) / (m.value + h.value);
        m.yld = (m.yld * m.value + h.yld * h.value) / (m.value + h.value);
        m.value += h.value;
        m.cost += h.cost;
        m.sourceCount += 1;
      }
    }

    const out = [...Object.values(bySymbol), ...(cash ? [cash] : [])];
    const totalValue = out.reduce((s, h) => s + h.value, 0);
    return out.map((h) => ({
      ...h,
      gain: h.cls === "Cash" ? 0 : h.value - h.cost,
      gainPct: h.cls === "Cash" ? 0 : ((h.value - h.cost) / h.cost) * 100,
      pct: totalValue ? (h.value / totalValue) * 100 : 0,
      dayAmt: (h.value * h.day) / 100,
    }));
  }, [holdings, pf]);

  const sorted = useMemo(() => {
    const arr = [...merged];
    const { key, dir } = sort;
    // The Day column sorts by dollar movement, not the % field of the same
    // name — a small position swinging 5% shouldn't outrank a large one
    // that moved 1% but by far more money. Rows with no live day change
    // (h.day === 0 — no quote source, e.g. cash or an unmapped crypto)
    // render as "—" rather than a number, so they always sort last instead
    // of landing in the middle of the ranking as a false zero.
    arr.sort((a, b) => {
      if (key === "day") {
        const aNo = a.day === 0, bNo = b.day === 0;
        if (aNo !== bNo) return aNo ? 1 : -1;
        const cmp = a.dayAmt - b.dayAmt;
        return dir === "asc" ? cmp : -cmp;
      }
      const av = a[key], bv = b[key];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [merged, sort]);

  const total = merged.reduce((s, h) => s + h.value, 0);
  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  // Cash carries cost === value (no gain) and no yield of its own here, so it
  // dilutes rather than distorts these blended figures.
  const totalCost = sorted.reduce((s, h) => s + h.cost, 0);
  const totalDayAmt = sorted.reduce((s, h) => s + h.dayAmt, 0);
  const totalDayPct = total ? (totalDayAmt / (total - totalDayAmt)) * 100 : 0;
  const investedCost = sorted.filter((h) => h.cls !== "Cash").reduce((s, h) => s + h.cost, 0);
  const totalGain = sorted.reduce((s, h) => s + h.gain, 0);
  const totalGainPct = investedCost ? (totalGain / investedCost) * 100 : 0;
  const blendedYld = total ? sorted.reduce((s, h) => s + h.yld * h.value, 0) / total : 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginTop: 18, borderBottom: `1px solid ${T.line}` }}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPf(id as "all" | Portfolio | "transactions")}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "8px 14px 12px", fontFamily: "inherit",
              fontSize: 14, fontWeight: pf === id ? 600 : 400, color: pf === id ? T.ink : T.inkSoft,
              borderBottom: pf === id ? `2px solid ${T.ledger}` : "2px solid transparent", marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
        {pf !== "transactions" && (
          <div style={{ marginLeft: "auto", alignSelf: "center", fontFamily: mono, fontSize: 12.5, color: T.inkSoft }}>{usd(total)}</div>
        )}
      </div>

      {pf === "transactions" ? (
        <TransactionsSection holdings={holdings} />
      ) : (
        <>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 18, overflow: "hidden" }}>
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
        {sorted.map((h, i) => {
          const isCash = h.cls === "Cash";
          return (
            <div
              key={h.sym}
              className={`row${i % 2 === 1 ? " row-alt" : ""}`}
              style={{
                display: "grid", gridTemplateColumns: GRID, alignItems: "center", height: ROW_HEIGHT,
                padding: "0 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.ink,
              }}
            >
              {/* Ticker bold + brand green over the company name in muted text
                  below — the stacked-symbol convention used across the dashboard. */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, overflow: "hidden" }}>
                {isCash ? (
                  <span style={{ fontWeight: 600 }}>Cash</span>
                ) : (
                  <>
                    <span style={{ fontFamily: mono, fontWeight: 700, color: T.ledger, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.sym}>
                      {formatTicker(h.sym)}
                      {h.sourceCount > 1 && (
                        <span
                          title={`Combined from ${h.sourceCount} accounts`}
                          style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: T.inkSoft }}
                        >
                          ×{h.sourceCount}
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11.5, color: T.inkSoft, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.name}>
                      {h.name}
                    </span>
                  </>
                )}
              </div>
              <div style={{ textAlign: "right", fontFamily: mono }}>{isCash ? "—" : usd(h.cost)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(h.value)}</div>
              <div style={{ textAlign: "right", fontFamily: mono }}>{h.pct.toFixed(1)}%</div>
              <div style={{ textAlign: "right", fontFamily: mono }}>{h.yld > 0 ? h.yld.toFixed(2) + "%" : "—"}</div>
              <div style={{ textAlign: "right" }}>{h.day === 0 ? <span style={{ fontFamily: mono }}>—</span> : <Delta pct={h.day} amt={h.dayAmt} size={13} weight={700} stacked />}</div>
              <div style={{ textAlign: "right" }}>{isCash ? <span style={{ fontFamily: mono }}>—</span> : <Delta pct={h.gainPct} amt={h.gain} size={13} weight={700} stacked />}</div>
            </div>
          );
        })}
        {sorted.length > 0 && (
          <div
            style={{
              display: "grid", gridTemplateColumns: GRID, alignItems: "center", height: ROW_HEIGHT,
              padding: "0 16px", fontSize: 13, fontWeight: 600, color: T.ink,
              background: "#EAF3EE", borderTop: `2px solid ${T.ledger}`,
            }}
          >
            <div>Total ({sorted.length})</div>
            <div style={{ textAlign: "right", fontFamily: mono }}>{usd(totalCost)}</div>
            <div style={{ textAlign: "right", fontFamily: mono }}>{usd(total)}</div>
            <div style={{ textAlign: "right", fontFamily: mono }}>100.0%</div>
            <div style={{ textAlign: "right", fontFamily: mono }}>{blendedYld > 0 ? blendedYld.toFixed(2) + "%" : "—"}</div>
            <div style={{ textAlign: "right" }}>
              <Delta pct={totalDayPct} amt={totalDayAmt} size={13} weight={700} stacked />
            </div>
            <div style={{ textAlign: "right" }}>
              <Delta pct={totalGainPct} amt={totalGain} size={13} weight={700} stacked />
            </div>
          </div>
        )}
      </div>

          <ManualPositions holdings={holdings} />
        </>
      )}
    </div>
  );
}
