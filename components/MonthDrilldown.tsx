"use client";

import { useMemo } from "react";
import useSWR from "swr";
import { T, mono } from "@/lib/theme";
import { usd } from "@/lib/format";
import { monthLabel } from "@/lib/weekly";
import { Modal } from "@/components/ui";
import { fetcher } from "@/lib/hooks/fetcher";
import { useIncome } from "@/lib/hooks/useIncome";
import { useEnrichedHoldings } from "@/lib/hooks/useEnrichedHoldings";
import { useDividendSchedule } from "@/lib/hooks/useDividendSchedule";
import { projectExpectedDividends } from "@/lib/expectedDividends";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";
import type { MonthlyFlowDetailPayload, FlowTransaction } from "@/app/api/monthly-flows/route";

// The "backup data" behind a bar chart's month — income/activity/expected
// detail content, shared between the standalone /month page (a direct-link-
// able URL) and MonthDrilldownModal below (an in-page popup a chart click
// opens without navigating away or spawning a new tab/window).

const TYPE_LABEL: Record<string, string> = {
  dividend: "Dividend", interest: "Interest", withholding_tax: "Withholding tax",
  buy: "Buy", sell: "Sell",
};

export const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const thStyle = { textAlign: "left" as const, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: T.ink, padding: "8px 16px", borderBottom: `1px solid ${T.line}` };
const tdStyle = { padding: "8px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13, fontFamily: mono };

function useActivityDetail(months: string[]) {
  const key = months.length ? `/api/monthly-flows?months=${months.join(",")}` : null;
  return useSWR<MonthlyFlowDetailPayload>(key, fetcher);
}

export function IncomeDetail({ months }: { months: string[] }) {
  const { data, isLoading } = useIncome();
  const rows = useMemo(
    () => (data?.transactions ?? []).filter((t) => months.includes(t.date.slice(0, 7))).sort((a, b) => b.date.localeCompare(a.date)),
    [data, months]
  );
  const total = rows.reduce((s, t) => s + t.amountCents, 0);

  if (isLoading) return <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>No dividend or interest activity in this period.</div>;

  return (
    <>
      <div style={{ fontFamily: mono, fontSize: 13, color: T.ink, marginBottom: 12 }}>{rows.length} payments · net {usd(total / 100)}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Source</th>
              <th style={thStyle}>Type</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t: IncomeTransaction) => (
              <tr key={t.id}>
                <td style={tdStyle}>{t.date}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }} title={t.name}>{t.source}</td>
                <td style={tdStyle}>{TYPE_LABEL[t.type]}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: t.amountCents >= 0 ? T.gain : T.loss }}>{usd(t.amountCents / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ActivityDetail({ months }: { months: string[] }) {
  const { data, isLoading } = useActivityDetail(months);
  const rows = data?.transactions ?? [];
  const invested = rows.filter((t) => t.type === "buy").reduce((s, t) => s + Math.abs(t.amountCents), 0);
  const sold = rows.filter((t) => t.type === "sell").reduce((s, t) => s + Math.abs(t.amountCents), 0);

  if (isLoading) return <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>Loading…</div>;
  if (rows.length === 0) return <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>No buy or sell activity in this period.</div>;

  return (
    <>
      <div style={{ fontFamily: mono, fontSize: 13, color: T.ink, marginBottom: 12 }}>
        {rows.length} transactions · invested {usd(invested / 100)} · sold {usd(sold / 100)}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Date</th>
              <th style={thStyle}>Symbol</th>
              <th style={thStyle}>Type</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Amount</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t: FlowTransaction) => (
              <tr key={t.id}>
                <td style={tdStyle}>{t.date}</td>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{t.symbol ?? "—"}</td>
                <td style={tdStyle}>{TYPE_LABEL[t.type]}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: t.type === "buy" ? T.gain : T.loss }}>{usd(Math.abs(t.amountCents) / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export function ExpectedDetail({ monthIndex }: { monthIndex: number }) {
  const { holdings, isLoading: holdingsLoading } = useEnrichedHoldings();
  const { data: incomeData, isLoading: incomeLoading } = useIncome();
  const { data: scheduleData, isLoading: scheduleLoading } = useDividendSchedule();

  const contributions = useMemo(() => {
    if (holdingsLoading || !incomeData) return [];
    const projection = projectExpectedDividends(holdings, incomeData.transactions, scheduleData?.schedule ?? []);
    return projection[monthIndex]?.bySymbol ?? [];
  }, [holdings, holdingsLoading, incomeData, scheduleData, monthIndex]);

  if (holdingsLoading || incomeLoading || scheduleLoading) return <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>Loading…</div>;
  if (contributions.length === 0) return <div style={{ fontFamily: mono, fontSize: 13, color: T.ink }}>No expected payments projected for this month.</div>;

  const total = contributions.reduce((s, c) => s + c.amountCents, 0);

  return (
    <>
      <div style={{ fontFamily: mono, fontSize: 13, color: T.ink, marginBottom: 12 }}>
        {contributions.length} positions · projected {usd(total / 100)}
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Symbol</th>
              <th style={thStyle}>Name</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Expected</th>
            </tr>
          </thead>
          <tbody>
            {contributions.map((c, i) => (
              <tr key={`${c.symbol}-${i}`}>
                <td style={{ ...tdStyle, fontWeight: 600 }}>{c.symbol}</td>
                <td style={{ ...tdStyle, fontFamily: "inherit" }}>{c.name}</td>
                <td style={{ ...tdStyle, textAlign: "right", color: T.gain }}>{usd(c.amountCents / 100)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export type MonthDrilldownTarget =
  | { category: "income"; months: string[] }
  | { category: "activity"; months: string[] }
  | { category: "expected"; monthIndex: number };

// The in-page popup a bar click opens — same content the standalone /month
// page renders, but as a Modal over the current tab instead of a
// window.open("_blank") new tab/window (which didn't work well on phone,
// where "a new tab" is disorienting and the back gesture doesn't just
// dismiss it the way closing a modal does).
export function MonthDrilldownModal({ target, onClose }: { target: MonthDrilldownTarget; onClose: () => void }) {
  const label =
    target.category === "expected"
      ? MONTH_NAMES[target.monthIndex] ?? "—"
      : target.months.map((m) => monthLabel(`${m}-01`)).join(" + ") || "—";
  const subtitle =
    target.category === "income" ? "Dividend & interest activity" : target.category === "activity" ? "Buy & sell activity" : "Projected dividend income";

  return (
    <Modal title={label} onClose={onClose}>
      <div style={{ fontSize: 12.5, color: T.ink, marginTop: -8, marginBottom: 14 }}>{subtitle}</div>
      {target.category === "income" ? (
        <IncomeDetail months={target.months} />
      ) : target.category === "activity" ? (
        <ActivityDetail months={target.months} />
      ) : (
        <ExpectedDetail monthIndex={target.monthIndex} />
      )}
    </Modal>
  );
}
