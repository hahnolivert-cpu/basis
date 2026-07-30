"use client";

import { useMemo, useState } from "react";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Delta } from "@/components/ui";
import { ManualPositions } from "@/components/ManualPositions";
import { formatTicker } from "@/lib/holdings";
import type { Holding, Portfolio } from "@/lib/types";

type SortKey = "name" | "sym" | "cost" | "value" | "yld" | "day" | "gain";
type Sort = { key: SortKey; dir: "asc" | "desc" };
// sourceCount, not the source list itself — the row shows a merge count, not
// which institutions hold it, per the "don't show where it's stored" ask.
type Row = Holding & { gain: number; gainPct: number; sourceCount: number };

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "name", label: "Asset", align: "left" },
  { key: "sym", label: "Ticker", align: "left" },
  { key: "cost", label: "Cost", align: "right" },
  { key: "value", label: "Value", align: "right" },
  { key: "yld", label: "Yield", align: "right" },
  { key: "day", label: "Day", align: "right" },
  { key: "gain", label: "Total gain", align: "right" },
];
const GRID = "2.1fr 0.75fr 0.9fr 1fr 0.7fr 1.1fr 1.3fr";
// Every row is this height regardless of content — a merged multi-source
// symbol no longer grows a second line, so rows stay uniform.
const ROW_HEIGHT = 40;

export function HoldingsTab({ holdings, capitalLabel = "976 Capital" }: { holdings: Holding[]; capitalLabel?: string }) {
  const TABS: [string, string][] = [
    ["all", "All"],
    ["capital", capitalLabel],
    ["personal", "Personal"],
  ];
  const [pf, setPf] = useState<"all" | Portfolio>("all");
  const [sort, setSort] = useState<Sort>({ key: "value", dir: "desc" });
  const rows = holdings.filter((h) => pf === "all" || h.pf === pf);

  // Cash consolidates into a single row regardless of symbol (Brex Treasury,
  // IBKR Cash, Chase checking, ...) — the ledger doesn't need per-account cash
  // lines, just the total. Everything else still merges by symbol, so the same
  // stock held at two brokers is one row.
  const merged = useMemo<Row[]>(() => {
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
    return out.map((h) => ({
      ...h,
      gain: h.cls === "Cash" ? 0 : h.value - h.cost,
      gainPct: h.cls === "Cash" ? 0 : ((h.value - h.cost) / h.cost) * 100,
    }));
  }, [rows]);

  const sorted = useMemo(() => {
    const arr = [...merged];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const av = a[key], bv = b[key];
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [merged, sort]);

  const total = merged.reduce((s, h) => s + h.value, 0);
  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div>
      <div style={{ display: "flex", gap: 8, marginTop: 18, borderBottom: `1px solid ${T.line}` }}>
        {TABS.map(([id, label]) => (
          <button
            key={id}
            onClick={() => setPf(id as "all" | Portfolio)}
            style={{
              background: "none", border: "none", cursor: "pointer", padding: "8px 14px 12px", fontFamily: "inherit",
              fontSize: 14, fontWeight: pf === id ? 600 : 400, color: pf === id ? T.ink : T.inkSoft,
              borderBottom: pf === id ? `2px solid ${T.ledger}` : "2px solid transparent", marginBottom: -1,
            }}
          >
            {label}
          </button>
        ))}
        <div style={{ marginLeft: "auto", alignSelf: "center", fontFamily: mono, fontSize: 12.5, color: T.inkSoft }}>{usd(total)}</div>
      </div>

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
          const dAmt = (h.value * h.day) / 100;
          const isCash = h.cls === "Cash";
          return (
            <div
              key={h.sym}
              className={`row${i % 2 === 1 ? " row-alt" : ""}`}
              style={{
                display: "grid", gridTemplateColumns: GRID, alignItems: "center", height: ROW_HEIGHT,
                padding: "0 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13,
              }}
            >
              <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={h.name}>
                {isCash ? "Cash" : h.name}
                {h.sourceCount > 1 && (
                  <span
                    title={`Combined from ${h.sourceCount} accounts`}
                    style={{ marginLeft: 6, fontSize: 9, fontFamily: mono, color: T.inkSoft }}
                  >
                    ×{h.sourceCount}
                  </span>
                )}
              </div>
              <div
                style={{
                  fontFamily: mono, fontSize: 12, color: h.etf ? T.ledger : T.inkSoft,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}
                title={isCash ? undefined : h.sym}
              >
                {isCash ? "—" : formatTicker(h.sym)}
              </div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{isCash ? "—" : usd(h.cost)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(h.value)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: h.yld > 0 ? T.ink : T.inkSoft }}>{h.yld > 0 ? h.yld.toFixed(2) + "%" : "—"}</div>
              <div style={{ textAlign: "right" }}>{h.day === 0 ? <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 12 }}>—</span> : <Delta pct={h.day} amt={dAmt} size={12} weight={700} />}</div>
              <div style={{ textAlign: "right" }}>{isCash ? <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 12 }}>—</span> : <Delta pct={h.gainPct} amt={h.gain} size={12} weight={700} />}</div>
            </div>
          );
        })}
      </div>

      <ManualPositions holdings={holdings} />
    </div>
  );
}
