"use client";

import { useMemo, useRef, useState } from "react";
import { useSWRConfig } from "swr";
import { BarChart, Bar, ResponsiveContainer, Tooltip, CartesianGrid, XAxis, YAxis, Legend } from "recharts";
import { T, mono, serif } from "@/lib/theme";
import { usd, usdK } from "@/lib/format";
import { monthLabel } from "@/lib/weekly";
import { Card, Eyebrow, Modal } from "@/components/ui";
import { CompositionCard } from "@/components/charts/CompositionCard";
import { useSpending } from "@/lib/hooks/useSpending";
import { fetcher } from "@/lib/hooks/fetcher";
import { useIsMobile } from "@/lib/hooks/useIsMobile";
import { usePersistedState } from "@/lib/hooks/usePersistedState";
import {
  personalRows,
  reimbursedRows,
  byMonth,
  byCategory,
  detectRecurring,
  monthKey,
  BUSINESS_EXPENSE_CATEGORIES,
  DATE_RANGE_PRESETS,
  dateRangeBounds,
  filterByDateRange,
  dateRangeLabel,
  type SpendRow,
  type DateRangePreset,
} from "@/lib/spending";

const REIMBURSED_BY = "976";

// A card is identified by source+last4 — Capital One cards get a "•• 1234"
// chip, the Brex charge card (no per-card last4 from the API) just reads
// "Brex". Keyed as one string so it works as a Map key / <select> value.
function cardKey(r: Pick<SpendRow, "source" | "cardLast4">) {
  return `${r.source}:${r.cardLast4}`;
}
function cardLabel(r: Pick<SpendRow, "source" | "cardLast4">) {
  return r.source === "brex" ? "Brex" : `•• ${r.cardLast4}`;
}

function TransactionRow({
  row,
  dense,
  onToggleReimbursed,
  busy,
}: {
  row: SpendRow;
  dense?: boolean;
  onToggleReimbursed: (row: SpendRow) => void;
  busy: boolean;
}) {
  // A Brex charge is inherently a 976 expense — there's nothing to "mark",
  // so it gets a plain badge instead of the personal-card toggle button.
  const isBrex = row.source === "brex";
  return (
    <div
      style={{
        display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap",
        padding: "9px 0", borderTop: `1px solid ${T.line}`, fontSize: dense ? 12 : 13,
        background: row.reimbursedBy ? T.tint : undefined,
      }}
    >
      <span style={{ minWidth: 0, flex: "1 1 240px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        <span style={{ fontFamily: mono, fontSize: 11, color: T.ink, marginRight: 8 }}>{row.date}</span>
        {row.description}
        <span style={{ color: T.ink, fontSize: 11, marginLeft: 8 }}>
          {cardLabel(row)} · {row.category}
        </span>
      </span>
      <span style={{ display: "inline-flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: mono, fontWeight: 500, color: row.amountCents < 0 ? T.gain : T.ink }}>{usd(row.amountCents / 100)}</span>
        {isBrex ? (
          <span
            title="Brex charges are always 976 spend"
            style={{ fontFamily: "inherit", fontSize: 10.5, fontWeight: 600, padding: "3px 9px", borderRadius: 999, border: `1px solid ${T.gain}`, background: T.gain, color: "#fff" }}
          >
            976
          </span>
        ) : (
          <button
            onClick={() => onToggleReimbursed(row)}
            disabled={busy}
            title="Toggle whether this was a 976 expense reimbursed via Brex"
            style={{
              cursor: busy ? "wait" : "pointer", fontFamily: "inherit", fontSize: 10.5, fontWeight: 600,
              padding: "3px 9px", borderRadius: 999,
              border: `1px solid ${row.reimbursedBy ? T.gain : T.line}`,
              background: row.reimbursedBy ? T.gain : "none",
              color: row.reimbursedBy ? "#fff" : T.inkSoft,
            }}
          >
            {row.reimbursedBy ? "976 ✓" : "Mark 976"}
          </button>
        )}
      </span>
    </div>
  );
}

export function SpendingTab() {
  const { data } = useSpending();
  const { mutate } = useSWRConfig();
  const isMobile = useIsMobile();
  const rows = useMemo(() => data?.rows ?? [], [data]);

  const [uploading, setUploading] = useState(false);
  const [uploadNote, setUploadNote] = useState<string | null>(null);
  const [uploadFailed, setUploadFailed] = useState(false);
  const [search, setSearch] = useState("");
  const [cardFilter, setCardFilter] = useState("all");
  const [showAllRows, setShowAllRows] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openedMonth, setOpenedMonth] = useState<string | null>(null);
  const [categoryDrilldown, setCategoryDrilldown] = useState<{ title: string; source: "personal" | "976" | "all"; names: string[] } | null>(null);
  const [rangePreset, setRangePreset] = usePersistedState<DateRangePreset>("spending.range", "all");
  const [customFrom, setCustomFrom] = usePersistedState("spending.range.from", "");
  const [customTo, setCustomTo] = usePersistedState("spending.range.to", "");
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Every stat, chart, and drilldown below reads from rangeRows, not the raw
  // rows fetched from the API — the date filter is the single source of
  // truth the whole tab adjusts to.
  const { from: rangeFrom, to: rangeTo } = useMemo(
    () => dateRangeBounds(rangePreset, customFrom, customTo),
    [rangePreset, customFrom, customTo]
  );
  const rangeRows = useMemo(() => filterByDateRange(rows, rangeFrom, rangeTo), [rows, rangeFrom, rangeTo]);

  const personal = useMemo(() => personalRows(rangeRows), [rangeRows]);
  const reimbursed = useMemo(() => reimbursedRows(rangeRows), [rangeRows]);
  const cards = useMemo(() => {
    const map = new Map<string, { key: string; label: string }>();
    for (const r of rangeRows) {
      const key = cardKey(r);
      if (!map.has(key)) map.set(key, { key, label: cardLabel(r) });
    }
    return Array.from(map.values()).sort((a, b) => a.label.localeCompare(b.label));
  }, [rangeRows]);

  const monthly = useMemo(() => {
    const p = byMonth(personal);
    const r = byMonth(reimbursed);
    const months = Array.from(new Set([...p.map((m) => m.month), ...r.map((m) => m.month)])).sort();
    return months.map((month) => ({
      month,
      label: monthLabel(`${month}-01`),
      personal: p.find((x) => x.month === month)?.amount ?? 0,
      reimbursed: r.find((x) => x.month === month)?.amount ?? 0,
    }));
  }, [personal, reimbursed]);

  const categories = useMemo(() => byCategory(personal), [personal]);
  const categoryTotal = categories.reduce((s, c) => s + c.value, 0);
  const reimbursedCategories = useMemo(() => byCategory(reimbursed), [reimbursed]);
  const reimbursedCategoryTotal = reimbursedCategories.reduce((s, c) => s + c.value, 0);
  // A narrow, deliberate whitelist of genuinely deductible business
  // expenses — not "everything on the Brex card", which also includes
  // dining, travel, and other spend that isn't itself a business expense
  // just because it happened to run through 976.
  const businessExpenses = useMemo(() => {
    const all = byCategory(rangeRows);
    return BUSINESS_EXPENSE_CATEGORIES.map((name) => ({ name, value: all.find((c) => c.name === name)?.value ?? 0 }));
  }, [rangeRows]);
  const businessExpenseTotal = businessExpenses.reduce((s, c) => s + c.value, 0);
  // Same merchant can be charged from either a personal card or the Brex
  // card (or both, at different times) — a subscription is a subscription
  // regardless of which one paid it, so this runs across every source.
  const recurring = useMemo(() => detectRecurring(rangeRows), [rangeRows]);

  // Each card's own total (not just its personal share) — otherwise the
  // Brex chip would always read $0, since every Brex row is reimbursed by
  // definition and drops out of `personal`.
  const cardTotals = useMemo(() => {
    const map = new Map<string, number>();
    for (const r of rangeRows) {
      if (r.amountCents <= 0) continue;
      const key = cardKey(r);
      map.set(key, (map.get(key) ?? 0) + r.amountCents / 100);
    }
    return map;
  }, [rangeRows]);

  // Totals for the selected range, not a fixed "this month"/"YTD" — the
  // whole point of the filter is that these adjust to whatever's picked.
  const totalSpend = rangeRows.filter((r) => r.amountCents > 0).reduce((s, r) => s + r.amountCents / 100, 0);
  const personalTotal = personal.reduce((s, r) => s + r.amountCents / 100, 0);
  const reimbursedTotal = reimbursed.reduce((s, r) => s + r.amountCents / 100, 0);
  const rangeDescription = dateRangeLabel(rangePreset, rangeFrom, rangeTo);

  const filteredRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rangeRows.filter((r) => (cardFilter === "all" || cardKey(r) === cardFilter) && (!q || r.description.toLowerCase().includes(q)));
  }, [rangeRows, cardFilter, search]);
  const visibleRows = showAllRows ? filteredRows : filteredRows.slice(0, 60);

  const monthRows = useMemo(
    () => (openedMonth ? rangeRows.filter((r) => monthKey(r.date) === openedMonth).sort((a, b) => b.date.localeCompare(a.date)) : []),
    [rangeRows, openedMonth]
  );

  const categoryDrilldownRows = useMemo(() => {
    if (!categoryDrilldown) return [];
    const base = categoryDrilldown.source === "personal" ? personal : categoryDrilldown.source === "976" ? reimbursed : rangeRows;
    return base.filter((r) => categoryDrilldown.names.includes(r.category)).sort((a, b) => b.date.localeCompare(a.date));
  }, [categoryDrilldown, personal, reimbursed, rangeRows]);

  const refresh = async () => {
    const fresh = await fetcher("/api/spending");
    await mutate("/api/spending", fresh, { revalidate: false });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    setUploadNote(null);
    setUploadFailed(false);
    let imported = 0;
    let failedFile: string | null = null;
    try {
      for (const file of Array.from(files)) {
        const csv = await file.text();
        const res = await fetch("/api/spending/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ csv }),
        });
        const body = await res.json();
        if (!res.ok) {
          failedFile = `${file.name}: ${body.error ?? "import failed"}`;
          break;
        }
        imported += body.imported ?? 0;
      }
      if (failedFile) {
        setUploadFailed(true);
        setUploadNote(failedFile);
      } else {
        setUploadNote(`Imported ${imported} row${imported === 1 ? "" : "s"}`);
        await refresh();
      }
    } catch (err) {
      setUploadFailed(true);
      setUploadNote(err instanceof Error ? err.message : String(err));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const toggleReimbursed = async (row: SpendRow) => {
    setBusyId(row.id);
    try {
      const res = await fetch("/api/spending/reimburse", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: row.id, reimbursedBy: row.reimbursedBy ? null : REIMBURSED_BY }),
      });
      if (res.ok) await refresh();
    } finally {
      setBusyId(null);
    }
  };

  const statStyle: React.CSSProperties = { flex: 1, minWidth: 150 };

  return (
    <div>
      <Card style={{ marginTop: 22 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 10 }}>
          <div>
            <Eyebrow style={{ marginBottom: 2 }}>Spending</Eyebrow>
            <div style={{ fontSize: 12, color: T.ink }}>
              Brex card spend syncs automatically (via Sync now) and always counts toward 976. Personal cards (Capital
              One today) come from a CSV upload — re-uploading is safe, overlapping rows are skipped.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
              style={{ display: "none" }}
              id="spend-csv-input"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              style={{
                cursor: uploading ? "wait" : "pointer", background: T.gain, color: "#fff", border: "none",
                borderRadius: 999, padding: "7px 16px", fontFamily: "inherit", fontSize: 12.5, fontWeight: 600, whiteSpace: "nowrap",
              }}
            >
              {uploading ? "Uploading…" : "Upload CSV"}
            </button>
          </div>
        </div>
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${T.line}`, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span style={{ fontSize: 11, color: T.ink, fontFamily: mono, letterSpacing: "0.04em", textTransform: "uppercase" }}>Date range</span>
          <select
            value={rangePreset}
            onChange={(e) => setRangePreset(e.target.value as DateRangePreset)}
            style={{ fontFamily: mono, fontSize: 12, padding: "6px 9px", border: `1px solid ${T.line}`, borderRadius: 8, background: T.card, color: T.ink }}
          >
            {DATE_RANGE_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
          {rangePreset === "custom" && (
            <>
              <input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                style={{ fontFamily: mono, fontSize: 12, padding: "5px 9px", border: `1px solid ${T.line}`, borderRadius: 8, background: T.card, color: T.ink }}
              />
              <span style={{ color: T.ink, fontSize: 12 }}>–</span>
              <input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                style={{ fontFamily: mono, fontSize: 12, padding: "5px 9px", border: `1px solid ${T.line}`, borderRadius: 8, background: T.card, color: T.ink }}
              />
            </>
          )}
        </div>
        {uploadNote && (
          <div style={{ marginTop: 10, fontSize: 12, fontFamily: mono, color: uploadFailed ? T.loss : T.gain }}>{uploadNote}</div>
        )}
        {cards.length > 0 && (
          <div style={{ marginTop: 14, display: "flex", gap: 8, flexWrap: "wrap" }}>
            {cards.map((c) => (
              <div
                key={c.key}
                style={{
                  fontFamily: mono, fontSize: 12, padding: "5px 11px", borderRadius: 999,
                  background: T.headerBg, border: `1px solid ${T.line}`, color: T.ink,
                }}
              >
                {c.label} · {usd(cardTotals.get(c.key) ?? 0)}
              </div>
            ))}
          </div>
        )}
      </Card>

      {rows.length === 0 ? (
        <Card style={{ marginTop: 16, fontSize: 13, color: T.ink }}>
          No spending yet — Brex syncs in via &ldquo;Sync now&rdquo; (Account menu), or upload a CSV export from a personal card.
        </Card>
      ) : rangeRows.length === 0 ? (
        <Card style={{ marginTop: 16, fontSize: 13, color: T.ink }}>
          No transactions in {rangeDescription.toLowerCase()} — try a wider date range.
        </Card>
      ) : (
        <>
          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
            <Card style={statStyle}>
              <Eyebrow style={{ marginBottom: 6 }}>Total spend</Eyebrow>
              <div style={{ fontFamily: serif, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 600 }}>{usd(totalSpend)}</div>
              <div style={{ fontSize: 11.5, color: T.ink, fontFamily: mono, marginTop: 4 }}>{rangeDescription}</div>
            </Card>
            <Card style={statStyle}>
              <Eyebrow style={{ marginBottom: 6 }}>Personal spend</Eyebrow>
              <div style={{ fontFamily: serif, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 600 }}>{usd(personalTotal)}</div>
              <div style={{ fontSize: 11.5, color: T.ink, fontFamily: mono, marginTop: 4 }}>excludes 976 reimbursements</div>
            </Card>
            <Card style={statStyle}>
              <Eyebrow style={{ marginBottom: 6 }}>976 spend</Eyebrow>
              <div style={{ fontFamily: serif, fontSize: "clamp(20px, 5vw, 26px)", fontWeight: 600, color: T.gain }}>
                {usd(reimbursedTotal)}
              </div>
              <div style={{ fontSize: 11.5, color: T.ink, fontFamily: mono, marginTop: 4 }}>Brex + reimbursed personal charges</div>
            </Card>
          </div>

          <Card style={{ marginTop: 16 }}>
            <Eyebrow style={{ marginBottom: 4 }}>Spending by month</Eyebrow>
            <div style={{ fontSize: 11.5, color: T.ink, marginBottom: 8 }}>Click a bar for that month&apos;s transactions.</div>
            <div style={{ height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={monthly} margin={{ left: 8, right: 8, top: 6 }}>
                  <CartesianGrid stroke={T.line} vertical={false} />
                  <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} interval="preserveStartEnd" />
                  <YAxis tickFormatter={usdK} tickLine={false} axisLine={false} tick={{ fontSize: 10.5, fill: T.ink, fontFamily: mono }} width={48} />
                  <Tooltip
                    content={({ active, payload }) =>
                      active && payload?.length ? (
                        <div style={{ background: T.tooltipBg, color: "#fff", padding: "6px 10px", borderRadius: 6, fontFamily: mono, fontSize: 12 }}>
                          <div>{payload[0].payload.label}</div>
                          <div>Personal: {usd(payload[0].payload.personal)}</div>
                          {payload[0].payload.reimbursed > 0 && <div>976: {usd(payload[0].payload.reimbursed)}</div>}
                          <div style={{ opacity: 0.7, marginTop: 2 }}>Click to view transactions</div>
                        </div>
                      ) : null
                    }
                  />
                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: mono, color: T.ink }} />
                  <Bar
                    dataKey="personal"
                    name="Personal"
                    stackId="spend"
                    fill={T.gain}
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d) => setOpenedMonth((d as unknown as { month: string }).month)}
                  />
                  <Bar
                    dataKey="reimbursed"
                    name="976"
                    stackId="spend"
                    fill={T.chart[4]}
                    radius={[3, 3, 0, 0]}
                    cursor="pointer"
                    onClick={(d) => setOpenedMonth((d as unknown as { month: string }).month)}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Card>

          <Card style={{ marginTop: 16 }}>
            <Eyebrow style={{ marginBottom: 4 }}>Business expenses</Eyebrow>
            <div style={{ fontSize: 11.5, color: T.ink, marginBottom: 12 }}>
              Health insurance, other insurance, Google, and Claude — the genuinely deductible slice of 976 spend,
              not everything that happens to run through the Brex card.
            </div>
            <div style={{ fontFamily: serif, fontSize: "clamp(22px, 5.5vw, 28px)", fontWeight: 600, marginBottom: 14 }}>
              {usd(businessExpenseTotal)}
            </div>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {businessExpenses.map((c) => (
                <button
                  key={c.name}
                  onClick={() => setCategoryDrilldown({ title: c.name, source: "all", names: [c.name] })}
                  style={{
                    flex: "1 1 140px", padding: "10px 14px", borderRadius: 10, textAlign: "left",
                    background: T.headerBg, border: `1px solid ${T.line}`, cursor: "pointer", fontFamily: "inherit", color: T.ink,
                  }}
                >
                  <div style={{ fontSize: 11, color: T.ink }}>{c.name}</div>
                  <div style={{ fontFamily: mono, fontSize: 15, fontWeight: 500, marginTop: 2, color: "unset" }}>{usd(c.value)}</div>
                </button>
              ))}
            </div>
          </Card>

          <div style={{ display: "flex", gap: 16, flexWrap: "wrap", marginTop: 16 }}>
            <CompositionCard
              title="Personal by category"
              data={categories}
              total={categoryTotal}
              donut
              flex={1}
              onSegmentClick={(name, names) => setCategoryDrilldown({ title: `Personal · ${name}`, source: "personal", names })}
            />
            <CompositionCard
              title="976 spend by category"
              data={reimbursedCategories}
              total={reimbursedCategoryTotal}
              donut
              flex={1}
              onSegmentClick={(name, names) => setCategoryDrilldown({ title: `976 · ${name}`, source: "976", names })}
            />
          </div>

          <Card style={{ marginTop: 16 }}>
            <Eyebrow>Recurring & subscriptions · all cards</Eyebrow>
            {recurring.length === 0 ? (
              <div style={{ fontSize: 12.5, color: T.ink, fontFamily: mono }}>
                Nothing charged by the same merchant in 3+ different months yet.
              </div>
            ) : (
              recurring.map((rm) => (
                <div
                  key={rm.merchant}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0", borderBottom: `1px solid ${T.line}`, fontSize: 12.5 }}
                >
                  <span style={{ minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {rm.merchant}
                    <span style={{ color: T.ink, fontSize: 11 }}> · {rm.months}mo · {rm.category}</span>
                  </span>
                  <span style={{ fontFamily: mono, flexShrink: 0, marginLeft: 10 }}>
                    {rm.minAmount === rm.maxAmount ? usd(rm.avgAmount) : `${usd(rm.minAmount)}–${usd(rm.maxAmount)}`}
                    <span style={{ color: T.ink }}>/mo avg</span>
                  </span>
                </div>
              ))
            )}
          </Card>

          <Card style={{ marginTop: 16 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 10, marginBottom: 12 }}>
              <Eyebrow style={{ marginBottom: 0 }}>Transactions</Eyebrow>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  value={cardFilter}
                  onChange={(e) => setCardFilter(e.target.value)}
                  style={{ fontFamily: mono, fontSize: 12, padding: "6px 9px", border: `1px solid ${T.line}`, borderRadius: 8, background: T.card, color: T.ink }}
                >
                  <option value="all">All cards</option>
                  {cards.map((c) => (
                    <option key={c.key} value={c.key}>
                      {c.label}
                    </option>
                  ))}
                </select>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search description…"
                  style={{ fontFamily: mono, fontSize: 12, padding: "6px 9px", border: `1px solid ${T.line}`, borderRadius: 8, background: T.card, color: T.ink, width: 180 }}
                />
              </div>
            </div>

            {visibleRows.map((r) => (
              <TransactionRow key={r.id} row={r} dense={isMobile} onToggleReimbursed={toggleReimbursed} busy={busyId === r.id} />
            ))}

            {filteredRows.length > visibleRows.length && (
              <button
                onClick={() => setShowAllRows(true)}
                style={{
                  display: "block", width: "100%", textAlign: "center", marginTop: 10, padding: "8px 0",
                  fontSize: 12.5, color: T.gain, background: "none", border: "none", cursor: "pointer", fontFamily: "inherit",
                }}
              >
                Show all {filteredRows.length} transactions
              </button>
            )}
          </Card>
        </>
      )}

      {/* In-page popup, not a new tab/window — same on phone and desktop. */}
      {openedMonth && (
        <Modal title={monthLabel(`${openedMonth}-01`)} onClose={() => setOpenedMonth(null)}>
          <div style={{ fontSize: 12.5, color: T.ink, marginTop: -8, marginBottom: 14 }}>{monthRows.length} transactions</div>
          {monthRows.map((r) => (
            <TransactionRow key={r.id} row={r} dense onToggleReimbursed={toggleReimbursed} busy={busyId === r.id} />
          ))}
        </Modal>
      )}

      {categoryDrilldown && (
        <Modal title={categoryDrilldown.title} onClose={() => setCategoryDrilldown(null)}>
          <div style={{ fontSize: 12.5, color: T.ink, marginTop: -8, marginBottom: 14 }}>
            {categoryDrilldownRows.length} transactions · {usd(categoryDrilldownRows.reduce((s, r) => s + r.amountCents / 100, 0))}
          </div>
          {categoryDrilldownRows.map((r) => (
            <TransactionRow key={r.id} row={r} dense onToggleReimbursed={toggleReimbursed} busy={busyId === r.id} />
          ))}
        </Modal>
      )}
    </div>
  );
}
