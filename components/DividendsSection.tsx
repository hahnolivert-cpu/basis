"use client";

import { useMemo } from "react";
import { T, mono, serif } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";
import { useIncome } from "@/lib/hooks/useIncome";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";

type SortKey = "date" | "source" | "type" | "portfolio" | "gross" | "withholding" | "net";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type TypeFilter = "all" | "dividend" | "interest";

type Row = {
  id: string;
  date: string;
  type: IncomeTransaction["type"];
  source: string;
  name: string;
  portfolio: "capital" | "personal";
  grossCents: number;
  withholdingCents: number;
};

const TYPE_LABEL: Record<IncomeTransaction["type"], string> = {
  dividend: "Dividend",
  interest: "Interest",
  withholding_tax: "Withholding tax",
};

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "date", label: "Date", align: "left" },
  { key: "source", label: "Source", align: "left" },
  { key: "type", label: "Type", align: "left" },
  { key: "portfolio", label: "Portfolio", align: "left" },
  { key: "gross", label: "Gross", align: "right" },
  { key: "withholding", label: "Withholding", align: "right" },
  { key: "net", label: "Net", align: "right" },
];
const GRID = "0.8fr 0.9fr 0.9fr 0.85fr 0.85fr 0.95fr 0.9fr";

const startOfYear = () => `${new Date().getFullYear()}-01-01`;

const inputStyle = {
  fontFamily: mono, fontSize: 12.5, padding: "7px 9px", border: `1px solid ${T.line}`, borderRadius: 7,
  background: T.card, color: T.ink,
};

const EMPTY: IncomeTransaction[] = [];

export function DividendsSection() {
  const { data, isLoading } = useIncome();
  const raw = data?.transactions ?? EMPTY;

  const [dateFrom, setDateFrom] = usePersistedState("div.dateFrom", startOfYear());
  const [dateTo, setDateTo] = usePersistedState("div.dateTo", "");
  const [typeFilter, setTypeFilter] = usePersistedState<TypeFilter>("div.type", "all");
  const [assetQuery, setAssetQuery] = usePersistedState("div.assetQuery", "");
  const [sort, setSort] = usePersistedState<Sort>("div.sort", { key: "date", dir: "desc" });
  const isMobile = useIsMobile();

  // Withholding tax arrives from IBKR as its own cash-transaction line, dated
  // and symbol-matched to the dividend it was withheld against — fold it
  // into that dividend's row as a column instead of listing it separately.
  // Any withholding row that can't find its match (shouldn't happen with
  // real data, but the sync can't guarantee it) still surfaces as its own
  // row rather than silently vanishing.
  const merged = useMemo<Row[]>(() => {
    const withholdingByKey = new Map<string, IncomeTransaction>();
    for (const t of raw) {
      if (t.type === "withholding_tax" && t.symbol) withholdingByKey.set(`${t.date}|${t.symbol}`, t);
    }
    const consumed = new Set<string>();
    const rows: Row[] = [];
    for (const t of raw) {
      if (t.type === "withholding_tax") continue;
      const key = t.symbol ? `${t.date}|${t.symbol}` : null;
      const wh = key ? withholdingByKey.get(key) : undefined;
      if (wh && key) consumed.add(key);
      rows.push({
        id: t.id, date: t.date, type: t.type, source: t.source, name: t.name, portfolio: t.portfolio,
        grossCents: t.amountCents, withholdingCents: wh?.amountCents ?? 0,
      });
    }
    for (const [key, t] of Array.from(withholdingByKey.entries())) {
      if (consumed.has(key)) continue;
      rows.push({
        id: t.id, date: t.date, type: t.type, source: t.source, name: t.name, portfolio: t.portfolio,
        grossCents: 0, withholdingCents: t.amountCents,
      });
    }
    return rows;
  }, [raw]);

  const filtered = useMemo(
    () =>
      merged.filter((r) => {
        if (dateFrom && r.date < dateFrom) return false;
        if (dateTo && r.date > dateTo) return false;
        if (typeFilter !== "all" && r.type !== typeFilter) return false;
        if (assetQuery && !`${r.source} ${r.name}`.toLowerCase().includes(assetQuery.toLowerCase())) return false;
        return true;
      }),
    [merged, dateFrom, dateTo, typeFilter, assetQuery]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    const val = (r: Row): number | string => {
      switch (key) {
        case "date": return r.date;
        case "source": return r.source;
        case "type": return r.type;
        case "portfolio": return r.portfolio;
        case "gross": return r.grossCents;
        case "withholding": return r.withholdingCents;
        case "net": return r.grossCents + r.withholdingCents;
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
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  // Summary cards track the selected date range (like the table and charts
  // below) but not the type/search filters — "Dividends" and "Interest"
  // need to stay visible side by side even when the table itself is
  // filtered down to just one of them.
  const dateFiltered = useMemo(
    () => raw.filter((t) => (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo)),
    [raw, dateFrom, dateTo]
  );
  const dividendsCents = dateFiltered.filter((t) => t.type === "dividend").reduce((s, t) => s + t.amountCents, 0);
  const interestCents = dateFiltered.filter((t) => t.type === "interest").reduce((s, t) => s + t.amountCents, 0);
  const withholdingCents = dateFiltered.filter((t) => t.type === "withholding_tax").reduce((s, t) => s + t.amountCents, 0);
  const netCents = dividendsCents + interestCents + withholdingCents;

  const totalGross = sorted.reduce((s, r) => s + r.grossCents, 0);
  const totalWithholding = sorted.reduce((s, r) => s + r.withholdingCents, 0);
  const totalNet = totalGross + totalWithholding;

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginBottom: 14 }}>Dividends</div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Dividends</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 13, color: T.gain }}>{usd(dividendsCents / 100)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Interest</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 13, color: T.gain }}>{usd(interestCents / 100)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Withholding tax</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 13, color: T.loss }}>{usd(withholdingCents / 100)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Net received</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>{usd(netCents / 100)}</div>
        </Card>
      </div>

      <Card style={{ marginBottom: 14 }}>
        <Eyebrow style={{ marginBottom: 10 }}>Filters</Eyebrow>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.ink }}>
            From <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} style={inputStyle} />
          </label>
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11.5, color: T.ink }}>
            To <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} style={inputStyle} />
          </label>
          <select value={typeFilter} onChange={(e) => setTypeFilter(e.target.value as TypeFilter)} style={inputStyle}>
            <option value="all">All types</option>
            <option value="dividend">Dividends</option>
            <option value="interest">Interest</option>
          </select>
          <input
            type="text"
            placeholder="Search source…"
            value={assetQuery}
            onChange={(e) => setAssetQuery(e.target.value)}
            style={{ ...inputStyle, width: 160 }}
          />
        </div>
      </Card>

      <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, overflow: "hidden" }}>
        {isLoading && (
          <div style={{ padding: "16px", fontSize: 12.5, color: T.ink, fontFamily: mono }}>Loading dividend history…</div>
        )}
        {!isLoading && sorted.length === 0 && (
          <div style={{ padding: "16px", fontSize: 12.5, color: T.ink, fontFamily: mono }}>
            {data?.error ? `Could not load dividend history: ${data.error}` : "No payments match these filters."}
          </div>
        )}
        {isMobile ? (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, padding: "8px 14px", borderBottom: `1px solid ${T.line}`, background: "#F4F7F5" }}>
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
            {sorted.map((r) => (
              <div key={r.id} style={{ padding: "12px 14px", borderBottom: `1px solid ${T.line}` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 10 }}>
                  <div>
                    <div style={{ fontFamily: mono, fontWeight: 700, color: T.gain, fontSize: 14 }} title={r.name}>
                      {r.source}
                    </div>
                    <div style={{ fontSize: 11.5, color: r.portfolio === "capital" ? T.gain : T.ink }}>
                      {TYPE_LABEL[r.type]} · {r.portfolio === "capital" ? "976 Capital" : "Personal"}
                    </div>
                  </div>
                  <div style={{ fontFamily: mono, fontSize: 12, color: T.ink, flexShrink: 0 }}>{r.date}</div>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginTop: 10 }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gross</div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: r.grossCents > 0 ? T.gain : T.ink }}>{r.grossCents !== 0 ? usd(r.grossCents / 100) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Withholding</div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: r.withholdingCents < 0 ? T.loss : T.ink }}>{r.withholdingCents !== 0 ? usd(r.withholdingCents / 100) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Net</div>
                    <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: r.grossCents + r.withholdingCents >= 0 ? T.gain : T.loss }}>
                      {usd((r.grossCents + r.withholdingCents) / 100)}
                    </div>
                  </div>
                </div>
              </div>
            ))}
            {sorted.length > 0 && (
              <div style={{ padding: "12px 14px", background: "#EAF3EE", borderTop: `2px solid ${T.gain}` }}>
                <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Total ({sorted.length})</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Gross</div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: T.gain }}>{usd(totalGross / 100)}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Withholding</div>
                    <div style={{ fontFamily: mono, fontSize: 12, color: totalWithholding < 0 ? T.loss : T.ink }}>{totalWithholding !== 0 ? usd(totalWithholding / 100) : "—"}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 9, color: T.ink, textTransform: "uppercase", letterSpacing: "0.06em" }}>Net</div>
                    <div style={{ fontFamily: mono, fontSize: 12, fontWeight: 500, color: totalNet >= 0 ? T.gain : T.loss }}>{usd(totalNet / 100)}</div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 760 }}>
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

            {sorted.map((r, i) => (
              <div
                key={r.id}
                className={`row${i % 2 === 1 ? " row-alt" : ""}`}
                style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13 }}
              >
                <div style={{ fontFamily: mono, fontSize: 12, color: T.ink }}>{r.date}</div>
                <div style={{ fontFamily: mono, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={r.name}>
                  {r.source}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: T.ink }}>{TYPE_LABEL[r.type]}</div>
                <div style={{ fontFamily: mono, fontSize: 12, color: r.portfolio === "capital" ? T.gain : T.ink }}>
                  {r.portfolio === "capital" ? "976 Capital" : "Personal"}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, color: r.grossCents > 0 ? T.gain : T.ink }}>
                  {r.grossCents !== 0 ? usd(r.grossCents / 100) : "—"}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, color: r.withholdingCents < 0 ? T.loss : T.ink }}>
                  {r.withholdingCents !== 0 ? usd(r.withholdingCents / 100) : "—"}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, color: r.grossCents + r.withholdingCents >= 0 ? T.gain : T.loss }}>
                  {usd((r.grossCents + r.withholdingCents) / 100)}
                </div>
              </div>
            ))}

            {sorted.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "10px 16px", background: "#EAF3EE", borderTop: `2px solid ${T.gain}`, fontSize: 13 }}>
                <div style={{ gridColumn: "1 / 4" }}>Total ({sorted.length})</div>
                <div />
                <div style={{ textAlign: "right", fontFamily: mono, color: T.gain }}>{usd(totalGross / 100)}</div>
                <div style={{ textAlign: "right", fontFamily: mono, color: totalWithholding < 0 ? T.loss : T.ink }}>
                  {totalWithholding !== 0 ? usd(totalWithholding / 100) : "—"}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, color: totalNet >= 0 ? T.gain : T.loss }}>
                  {usd(totalNet / 100)}
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
