"use client";

import { useMemo, useState } from "react";
import { T, mono, serif } from "@/lib/theme";
import { fmt, sign, usd } from "@/lib/format";
import { toRows, type WeeklyRow } from "@/lib/weekly";
import { Card } from "@/components/ui";
import { WeeklyTotalCard } from "@/components/charts/WeeklyTotalCard";
import { GoalProgressCard } from "@/components/charts/GoalProgressCard";
import { AllocationHistoryCard } from "@/components/charts/AllocationHistoryCard";
import { useWeeklySnapshots } from "@/lib/hooks/useWeeklySnapshots";

type SortKey = "date" | "crypto" | "equities" | "cash" | "total" | "wowAmt" | "wowPct" | "eur" | "btc";
type Sort = { key: SortKey; dir: "asc" | "desc" };

const COLS: { key: SortKey; label: string; align: "left" | "right" }[] = [
  { key: "date", label: "Week", align: "left" },
  { key: "crypto", label: "Crypto", align: "right" },
  { key: "equities", label: "Equities", align: "right" },
  { key: "cash", label: "Cash", align: "right" },
  { key: "total", label: "Total", align: "right" },
  { key: "wowAmt", label: "WoW $", align: "right" },
  { key: "wowPct", label: "WoW %", align: "right" },
  { key: "eur", label: "EUR", align: "right" },
  { key: "btc", label: "BTC", align: "right" },
];
const GRID = "1.25fr 1fr 1fr 1fr 1.1fr 1.05fr 0.85fr 1fr 0.8fr";

function WeeklyTable({ rows }: { rows: WeeklyRow[] }) {
  const [sort, setSort] = useState<Sort>({ key: "date", dir: "desc" });

  const sorted = useMemo(() => {
    const arr = [...rows];
    const { key, dir } = sort;
    arr.sort((a, b) => {
      const av = a[key], bv = b[key];
      // Rows without a week-over-week value (the first week) sort last either way.
      if (av === null) return 1;
      if (bv === null) return -1;
      const cmp = typeof av === "string" ? av.localeCompare(bv as string) : (av as number) - (bv as number);
      return dir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [rows, sort]);

  const clickSort = (key: SortKey) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "desc" }));

  return (
    <div style={{ background: T.card, border: `1px solid ${T.line}`, borderRadius: 10, marginTop: 16, overflow: "hidden" }}>
      <div style={{ overflowX: "auto" }}>
        <div style={{ minWidth: 860 }}>
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
          {sorted.map((r) => (
            <div
              key={r.date}
              className="row"
              style={{
                display: "grid", gridTemplateColumns: GRID, alignItems: "center", padding: "9px 20px",
                borderBottom: `1px solid ${T.line}`, fontSize: 13,
                // Auto rows sit on a faint tint so machine-written weeks are
                // distinguishable from the imported spreadsheet history.
                background: r.source === "auto" ? "#FAFCFA" : undefined,
              }}
            >
              <div style={{ fontFamily: mono, fontSize: 12, display: "inline-flex", alignItems: "center", gap: 6 }}>
                <span
                  title={r.source === "auto" ? "Written automatically by the Sunday cron" : "Imported from spreadsheet history"}
                  style={{
                    width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                    background: r.source === "auto" ? T.ledger : T.line,
                  }}
                />
                {r.date}
              </div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{usd(r.crypto)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{usd(r.equities)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>{usd(r.cash)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontWeight: 500, fontSize: 12.5 }}>{usd(r.total)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: r.wowAmt === null ? T.inkSoft : r.wowAmt >= 0 ? T.gain : T.loss }}>
                {r.wowAmt === null ? "—" : sign(r.wowAmt, usd(r.wowAmt))}
              </div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: r.wowPct === null ? T.inkSoft : r.wowPct >= 0 ? T.gain : T.loss }}>
                {r.wowPct === null ? "—" : sign(r.wowPct, r.wowPct.toFixed(1) + "%")}
              </div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>€{fmt(r.eur)}</div>
              <div style={{ textAlign: "right", fontFamily: mono, fontSize: 12, color: T.inkSoft }}>₿{r.btc.toFixed(2)}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TrackingTab() {
  const { data, isLoading } = useWeeklySnapshots();
  const rows = useMemo(() => toRows(data?.snapshots ?? []), [data]);

  if (isLoading) {
    return (
      <Card style={{ marginTop: 22 }}>
        <div style={{ fontSize: 13, color: T.inkSoft, fontFamily: mono }}>Loading weekly history…</div>
      </Card>
    );
  }

  if (data?.error || rows.length === 0) {
    return (
      <Card style={{ marginTop: 22 }}>
        <div style={{ fontFamily: serif, fontSize: 18, fontWeight: 600, marginBottom: 6 }}>No weekly history yet</div>
        <div style={{ fontSize: 12.5, color: T.inkSoft, lineHeight: 1.6 }}>
          {data?.error
            ? `Could not load weekly_snapshots: ${data.error}`
            : "Seed it with: node --env-file=.env.local scripts/import-weekly-snapshots.mjs"}
        </div>
      </Card>
    );
  }

  const latest = rows.at(-1)!;
  const autoCount = rows.filter((r) => r.source === "auto").length;

  return (
    <div>
      <WeeklyTotalCard rows={rows} />
      <GoalProgressCard total={latest.total} />
      <AllocationHistoryCard rows={rows} />
      <div style={{ fontFamily: serif, fontSize: 22, fontWeight: 600, marginTop: 30, marginBottom: 2 }}>Weekly detail</div>
      <div style={{ fontSize: 12, color: T.inkSoft }}>
        {rows.length} weeks · {rows.length - autoCount} imported, {autoCount} recorded automatically. EUR and BTC totals
        use each week&apos;s own historical rate.
      </div>
      <WeeklyTable rows={rows} />
    </div>
  );
}
