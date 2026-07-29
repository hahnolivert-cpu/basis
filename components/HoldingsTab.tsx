"use client";

import { useMemo, useState } from "react";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { subclass } from "@/lib/calc";
import { Delta } from "@/components/ui";
import type { Holding, Portfolio } from "@/lib/types";

type SortKey = "sym" | "klass" | "cost" | "value" | "day" | "gain";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type MergedRow = Holding & { sources: string[]; klass: string; gain: number; gainPct: number };

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "sym", label: "Asset", align: "left" },
  { key: "klass", label: "Class", align: "left" },
  { key: "cost", label: "Cost", align: "right" },
  { key: "value", label: "Value", align: "right" },
  { key: "day", label: "Day", align: "right" },
  { key: "gain", label: "Total gain", align: "right" },
];
const GRID = "2.2fr 0.8fr 1fr 1fr 1.2fr 1.4fr";
const TABS: [string, string][] = [
  ["all", "All"],
  ["capital", "976 Capital"],
  ["personal", "Personal"],
];

export function HoldingsTab({ holdings }: { holdings: Holding[] }) {
  const [pf, setPf] = useState<"all" | Portfolio>("all");
  const [sort, setSort] = useState<Sort>({ key: "value", dir: "desc" });
  const rows = holdings.filter((h) => pf === "all" || h.pf === pf);

  // Consolidate identical symbols held across accounts/portfolios
  const merged = useMemo<MergedRow[]>(() => {
    const map: Record<string, Holding & { sources: string[] }> = {};
    for (const h of rows) {
      if (!map[h.sym]) map[h.sym] = { ...h, sources: [] };
      else {
        const m = map[h.sym];
        m.day = (m.day * m.value + h.day * h.value) / (m.value + h.value);
        m.value += h.value;
        m.cost += h.cost;
      }
      map[h.sym].sources.push(`${h.acct}${h.pf === "capital" ? " · 976" : " · Personal"}`);
    }
    return Object.values(map).map((h) => ({
      ...h,
      klass: subclass(h),
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
        <div style={{ display: "grid", gridTemplateColumns: GRID, padding: "0 20px", borderBottom: `1px solid ${T.line}`, background: "#F4F7F5" }}>
          {COLS.map((c) => {
            const active = sort.key === c.key;
            return (
              <button
                key={c.key}
                onClick={() => clickSort(c.key)}
                style={{
                  background: "none", border: "none", cursor: "pointer", padding: "10px 0", fontFamily: "inherit",
                  fontSize: 10.5, letterSpacing: "0.12em", textTransform: "uppercase", fontWeight: active ? 700 : 500,
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
        {sorted.map((h) => {
          const dAmt = (h.value * h.day) / 100;
          const isCash = h.cls === "Cash";
          const multi = h.sources.length > 1;
          return (
            <div key={h.sym} className="row" style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "11px 20px", borderBottom: `1px solid ${T.line}`, fontSize: 13.5 }}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {h.sym}
                  {multi && (
                    <span title={h.sources.join(" + ")} style={{ marginLeft: 7, fontSize: 9.5, fontFamily: mono, color: "#fff", background: T.ledger, borderRadius: 4, padding: "1.5px 6px", verticalAlign: "1px" }}>
                      {h.sources.length} accts
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11.5, color: T.inkSoft, marginTop: 1 }}>{multi ? h.sources.join("  +  ") : `${h.name} · ${h.sources[0]}`}</div>
              </div>
              <div style={{ fontFamily: mono, fontSize: 11.5, color: h.klass === "ETFs" ? T.ledger : T.inkSoft }}>{h.klass}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12.5, color: T.inkSoft }}>{isCash ? "—" : usd(h.cost)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500 }}>{usd(h.value)}</div>
              <div style={{ textAlign: "right" }}>{h.day === 0 ? <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 12.5 }}>—</span> : <Delta pct={h.day} amt={dAmt} size={12.5} />}</div>
              <div style={{ textAlign: "right" }}>{isCash ? <span style={{ color: T.inkSoft, fontFamily: mono, fontSize: 12.5 }}>—</span> : <Delta pct={h.gainPct} amt={h.gain} size={12.5} />}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
