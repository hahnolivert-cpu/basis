"use client";

import { useMemo } from "react";
import { T, mono, serif } from "@/lib/theme";
import { usd } from "@/lib/format";
import { Card, Eyebrow } from "@/components/ui";
import { useIncome } from "@/lib/hooks/useIncome";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";

type SortKey = "date" | "asset" | "type" | "portfolio" | "amount";
type Sort = { key: SortKey; dir: "asc" | "desc" };
type TypeFilter = "all" | "dividend" | "interest" | "withholding_tax";

const TYPE_LABEL: Record<IncomeTransaction["type"], string> = {
  dividend: "Dividend",
  interest: "Interest",
  withholding_tax: "Withholding tax",
};

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "date", label: "Date", align: "left" },
  { key: "asset", label: "Source", align: "left" },
  { key: "type", label: "Type", align: "left" },
  { key: "portfolio", label: "Portfolio", align: "left" },
  { key: "amount", label: "Amount", align: "right" },
];
const GRID = "0.9fr 1.6fr 1.1fr 0.9fr 1fr";

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

  const filtered = useMemo(
    () =>
      raw.filter((t) => {
        if (dateFrom && t.date < dateFrom) return false;
        if (dateTo && t.date > dateTo) return false;
        if (typeFilter !== "all" && t.type !== typeFilter) return false;
        if (assetQuery && !`${t.symbol ?? ""} ${t.name}`.toLowerCase().includes(assetQuery.toLowerCase())) return false;
        return true;
      }),
    [raw, dateFrom, dateTo, typeFilter, assetQuery]
  );

  const sorted = useMemo(() => {
    const arr = [...filtered];
    const { key, dir } = sort;
    const val = (r: IncomeTransaction): number | string => {
      switch (key) {
        case "date": return r.date;
        case "asset": return r.symbol ?? r.name;
        case "type": return r.type;
        case "portfolio": return r.portfolio;
        case "amount": return r.amountCents;
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

  const dividendsCents = filtered.filter((t) => t.type === "dividend").reduce((s, t) => s + t.amountCents, 0);
  const interestCents = filtered.filter((t) => t.type === "interest").reduce((s, t) => s + t.amountCents, 0);
  const withholdingCents = filtered.filter((t) => t.type === "withholding_tax").reduce((s, t) => s + t.amountCents, 0);
  const netCents = dividendsCents + interestCents + withholdingCents;

  return (
    <div style={{ marginTop: 30 }}>
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginBottom: 14 }}>Dividends</div>

      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginBottom: 14 }}>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Dividends</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 20, color: T.gain }}>{usd(dividendsCents / 100)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Interest</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 20, color: T.gain }}>{usd(interestCents / 100)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Withholding tax</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 20, color: T.loss }}>{usd(withholdingCents / 100)}</div>
        </Card>
        <Card style={{ flex: 1, minWidth: 160 }}>
          <Eyebrow style={{ marginBottom: 6 }}>Net received</Eyebrow>
          <div style={{ fontFamily: mono, fontSize: 20, color: T.ink }}>{usd(netCents / 100)}</div>
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
            <option value="withholding_tax">Withholding tax</option>
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
        <div style={{ overflowX: "auto" }}>
          <div style={{ minWidth: 640 }}>
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
                      color: active ? T.ledger : T.ink, textAlign: c.align, display: "flex",
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
              <div style={{ padding: "16px", fontSize: 12.5, color: T.ink, fontFamily: mono }}>Loading dividend history…</div>
            )}
            {!isLoading && sorted.length === 0 && (
              <div style={{ padding: "16px", fontSize: 12.5, color: T.ink, fontFamily: mono }}>
                {data?.error ? `Could not load dividend history: ${data.error}` : "No payments match these filters."}
              </div>
            )}

            {sorted.map((t, i) => (
              <div
                key={t.id}
                className={`row${i % 2 === 1 ? " row-alt" : ""}`}
                style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "8px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13 }}
              >
                <div style={{ fontFamily: mono, fontSize: 12, color: T.ink }}>{t.date}</div>
                <div style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={t.name}>
                  {t.symbol ?? t.name}
                </div>
                <div style={{ fontFamily: mono, fontSize: 12, color: T.ink }}>{TYPE_LABEL[t.type]}</div>
                <div style={{ fontFamily: mono, fontSize: 12, color: t.portfolio === "capital" ? T.ledger : "#C09A5B" }}>
                  {t.portfolio === "capital" ? "976 Capital" : "Personal"}
                </div>
                <div style={{ textAlign: "right", fontFamily: mono, color: t.amountCents >= 0 ? T.gain : T.loss }}>
                  {usd(t.amountCents / 100)}
                </div>
              </div>
            ))}

            {sorted.length > 0 && (
              <div style={{ display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "10px 16px", background: "#EAF3EE", borderTop: `2px solid ${T.ledger}`, fontSize: 13 }}>
                <div style={{ gridColumn: "1 / 4" }}>Total ({sorted.length})</div>
                <div />
                <div style={{ textAlign: "right", fontFamily: mono, color: netCents >= 0 ? T.gain : T.loss }}>
                  {usd(sorted.reduce((s, t) => s + t.amountCents, 0) / 100)}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
