"use client";

import { useMemo, useState } from "react";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Delta } from "@/components/ui";
import { ManualPositions } from "@/components/ManualPositions";
import { TransactionsSection } from "@/components/TransactionsSection";
import { DividendsSection } from "@/components/DividendsSection";
import { formatTicker } from "@/lib/holdings";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
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
    ["dividends", "Dividends"],
  ];
  const [pf, setPf] = usePersistedState<"all" | Portfolio | "transactions" | "dividends">("holdings.pf", "all");
  const [sort, setSort] = useState<Sort>({ key: "value", dir: "desc" });
  const isMobile = useIsMobile();

  // Cash consolidates into a single row regardless of symbol (Brex Treasury,
  // IBKR Cash, Chase checking, ...) — the ledger doesn't need per-account cash
  // lines, just the total. Everything else still merges by symbol, so the same
  // stock held at two brokers is one row.
  const merged = useMemo<Row[]>(() => {
    const rows = pf === "transactions" || pf === "dividends" ? [] : holdings.filter((h) => pf === "all" || h.pf === pf);
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
    // Excluded rows (the net-worth toggle, off) still render so they stay
    // visible and switchable, but don't count toward this — or the Total
    // row's — denominator.
    const totalValue = out.filter((h) => h.includedInNetWorth !== false).reduce((s, h) => s + h.value, 0);
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

  // Rows toggled out of net worth still render (below) so they stay visible
  // and switchable, but are excluded from every sum here — same rule as the
  // dashboard and every chart.
  const counted = sorted.filter((h) => h.includedInNetWorth !== false);
  const total = counted.reduce((s, h) => s + h.value, 0);
  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  // Cash carries cost === value (no gain) and no yield of its own here, so it
  // dilutes rather than distorts these blended figures.
  const totalCost = counted.reduce((s, h) => s + h.cost, 0);
  const totalDayAmt = counted.reduce((s, h) => s + h.dayAmt, 0);
  const totalDayPct = total ? (totalDayAmt / (total - totalDayAmt)) * 100 : 0;
  const investedCost = counted.filter((h) => h.cls !== "Cash").reduce((s, h) => s + h.cost, 0);
  const totalGain = counted.reduce((s, h) => s + h.gain, 0);
  const totalGainPct = investedCost ? (totalGain / investedCost) * 100 : 0;
  const blendedYld = total ? counted.reduce((s, h) => s + h.yld * h.value, 0) / total : 0;

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginTop: 18, borderBottom: `1px solid ${T.line}`, flexWrap: "wrap", rowGap: 6 }}>
        <div style={{ display: "flex", gap: 8, overflowX: "auto" }}>
          {TABS.map(([id, label]) => (
            <button
              key={id}
              onClick={() => setPf(id as "all" | Portfolio | "transactions" | "dividends")}
              style={{
                background: "none", border: "none", cursor: "pointer", padding: "8px 14px 12px", fontFamily: "inherit",
                fontSize: 14, fontWeight: pf === id ? 600 : 400, color: pf === id ? T.ink : T.ink,
                borderBottom: pf === id ? `2px solid ${T.gain}` : "2px solid transparent", marginBottom: -1,
                whiteSpace: "nowrap", flexShrink: 0,
              }}
            >
              {label}
            </button>
          ))}
        </div>
        {pf !== "transactions" && pf !== "dividends" && (
          <div style={{ marginLeft: "auto", alignSelf: "center", fontFamily: mono, fontSize: 12.5, color: T.ink }}>{usd(total)}</div>
        )}
      </div>

      {pf === "transactions" ? (
        <TransactionsSection holdings={holdings} />
      ) : pf === "dividends" ? (
        <DividendsSection />
      ) : (
        <>
      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 18, overflow: "hidden" }}>
        {isMobile ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${T.line}`, background: "#F4F7F5" }}>
              <select
                value={sort.key}
                onChange={(e) => clickSort(e.target.value as SortKey)}
                style={{
                  fontFamily: "inherit", fontSize: 11, color: T.ink, background: "none", border: `1px solid ${T.line}`,
                  borderRadius: 6, padding: "4px 6px",
                }}
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
            {sorted.map((h) => {
              const isCash = h.cls === "Cash";
              const excluded = h.includedInNetWorth === false;
              return (
                <div key={h.sym} style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}`, opacity: excluded ? 0.55 : 1 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      {isCash ? (
                        <span style={{ fontWeight: 600, fontSize: 14 }}>Cash</span>
                      ) : (
                        <>
                          <div style={{ fontFamily: mono, fontWeight: 700, color: T.gain, fontSize: 14 }}>
                            {formatTicker(h.sym)}
                            {h.sourceCount > 1 && (
                              <span title={`Combined from ${h.sourceCount} accounts`} style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: T.ink }}>
                                ×{h.sourceCount}
                              </span>
                            )}
                            {excluded && (
                              <span
                                title="Not counted in net worth or any chart"
                                style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 4, padding: "1px 5px" }}
                              >
                                excluded
                              </span>
                            )}
                          </div>
                          <div style={{ fontSize: 11.5, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{h.name}</div>
                        </>
                      )}
                    </div>
                    <div style={{ textAlign: "right", flexShrink: 0 }}>
                      <div style={{ fontFamily: mono, fontWeight: 600, fontSize: 14 }}>{usd(h.value)}</div>
                      <div style={{ fontSize: 10.5, color: T.ink, fontFamily: mono }}>{excluded ? "excluded" : `${h.pct.toFixed(1)}% of total`}</div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                    <div>
                      <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cost</div>
                      <div style={{ fontFamily: mono, fontSize: 12 }}>{isCash ? "—" : usd(h.cost)}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Yield</div>
                      <div style={{ fontFamily: mono, fontSize: 12 }}>{h.yld > 0 ? h.yld.toFixed(2) + "%" : "—"}</div>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Day</div>
                      {h.day === 0 ? <div style={{ fontFamily: mono, fontSize: 12 }}>—</div> : <Delta pct={h.day} amt={h.dayAmt} size={12} weight={600} />}
                    </div>
                  </div>
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total gain</div>
                    {isCash ? <div style={{ fontFamily: mono, fontSize: 12 }}>—</div> : <Delta pct={h.gainPct} amt={h.gain} size={12} weight={600} />}
                  </div>
                </div>
              );
            })}
            {sorted.length > 0 && (
              <div style={{ padding: "12px 14px", background: "#EAF3EE", borderTop: `2px solid ${T.gain}` }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>Total ({counted.length})</span>
                  <span style={{ fontFamily: mono, fontWeight: 600, fontSize: 14 }}>{usd(total)}</span>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Cost</div>
                    <div style={{ fontFamily: mono, fontSize: 12 }}>{usd(totalCost)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Yield</div>
                    <div style={{ fontFamily: mono, fontSize: 12 }}>{blendedYld > 0 ? blendedYld.toFixed(2) + "%" : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Day</div>
                    <Delta pct={totalDayPct} amt={totalDayAmt} size={12} weight={600} />
                  </div>
                </div>
                <div style={{ marginTop: 8 }}>
                  <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Total gain</div>
                  <Delta pct={totalGainPct} amt={totalGain} size={12} weight={600} />
                </div>
              </div>
            )}
          </>
        ) : (
        <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 720 }}>
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
        {sorted.map((h, i) => {
          const isCash = h.cls === "Cash";
          const excluded = h.includedInNetWorth === false;
          return (
            <div
              key={h.sym}
              className={`row${i % 2 === 1 ? " row-alt" : ""}`}
              style={{
                display: "grid", gridTemplateColumns: GRID, alignItems: "center", height: ROW_HEIGHT,
                padding: "0 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13, color: T.ink,
                opacity: excluded ? 0.55 : 1,
              }}
            >
              {/* Ticker bold + brand green over the company name in muted text
                  below — the stacked-symbol convention used across the dashboard. */}
              <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", minWidth: 0, overflow: "hidden" }}>
                {isCash ? (
                  <span style={{ fontWeight: 600 }}>Cash</span>
                ) : (
                  <>
                    <span style={{ fontFamily: mono, fontWeight: 700, color: T.gain, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.sym}>
                      {formatTicker(h.sym)}
                      {h.sourceCount > 1 && (
                        <span
                          title={`Combined from ${h.sourceCount} accounts`}
                          style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: T.ink }}
                        >
                          ×{h.sourceCount}
                        </span>
                      )}
                      {excluded && (
                        <span
                          title="Not counted in net worth or any chart"
                          style={{ marginLeft: 6, fontSize: 9, fontWeight: 400, color: T.ink, border: `1px solid ${T.line}`, borderRadius: 4, padding: "1px 5px" }}
                        >
                          excluded
                        </span>
                      )}
                    </span>
                    <span style={{ fontSize: 11.5, color: T.ink, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.name}>
                      {h.name}
                    </span>
                  </>
                )}
              </div>
              <div style={{ textAlign: "right", fontFamily: mono }}>{isCash ? "—" : usd(h.cost)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(h.value)}</div>
              <div style={{ textAlign: "right", fontFamily: mono }}>{excluded ? "—" : `${h.pct.toFixed(1)}%`}</div>
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
              padding: "0 16px", fontSize: 13, color: T.ink,
              background: "#EAF3EE", borderTop: `2px solid ${T.gain}`,
            }}
          >
            <div>Total ({counted.length})</div>
            <div style={{ textAlign: "right", fontFamily: mono }}>{usd(totalCost)}</div>
            <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(total)}</div>
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
        </div>
        )}
      </div>

          <ManualPositions holdings={holdings} />
        </>
      )}
    </div>
  );
}
