"use client";

import { Suspense, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import useSWR from "swr";
import { T, mono, serif, sans } from "@/lib/theme";
import { usd } from "@/lib/format";
import { monthLabel } from "@/lib/weekly";
import { Card } from "@/components/ui";
import { fetcher } from "@/lib/hooks/fetcher";
import { useIncome } from "@/lib/hooks/useIncome";
import { useEnrichedHoldings } from "@/lib/hooks/useEnrichedHoldings";
import { useDividendSchedule } from "@/lib/hooks/useDividendSchedule";
import { projectExpectedDividends } from "@/lib/expectedDividends";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";
import type { MonthlyFlowDetailPayload, FlowTransaction } from "@/app/api/monthly-flows/route";

const TYPE_LABEL: Record<string, string> = {
  dividend: "Dividend", interest: "Interest", withholding_tax: "Withholding tax",
  buy: "Buy", sell: "Sell",
};

const MONTH_NAMES = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

const thStyle = { textAlign: "left" as const, fontSize: 10, letterSpacing: "0.1em", textTransform: "uppercase" as const, color: T.ink, padding: "8px 16px", borderBottom: `1px solid ${T.line}` };
const tdStyle = { padding: "8px 16px", borderBottom: `1px solid ${T.line}`, fontSize: 13, fontFamily: mono };

function useActivityDetail(months: string[]) {
  const key = months.length ? `/api/monthly-flows?months=${months.join(",")}` : null;
  return useSWR<MonthlyFlowDetailPayload>(key, fetcher);
}

function IncomeDetail({ months }: { months: string[] }) {
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
    </>
  );
}

function ActivityDetail({ months }: { months: string[] }) {
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
    </>
  );
}

function ExpectedDetail({ monthIndex }: { monthIndex: number }) {
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
    </>
  );
}

function MonthContent() {
  const params = useSearchParams();
  const category = params.get("category") === "activity" ? "activity" : params.get("category") === "expected" ? "expected" : "income";
  const months = (params.get("months") ?? "").split(",").filter(Boolean);
  const monthIndex = Number(params.get("month") ?? "-1");

  const label =
    category === "expected"
      ? MONTH_NAMES[monthIndex] ?? "—"
      : months.map((m) => monthLabel(`${m}-01`)).join(" + ") || "—";
  const subtitle =
    category === "income" ? "Dividend & interest activity" : category === "activity" ? "Buy & sell activity" : "Projected dividend income";

  return (
    <div style={{ minHeight: "100vh", background: T.paper, color: T.ink, fontFamily: sans, padding: "32px 24px" }}>
      <div style={{ maxWidth: 780, margin: "0 auto" }}>
        <div style={{ fontFamily: serif, fontSize: 24, fontWeight: 600, marginBottom: 4 }}>{label}</div>
        <div style={{ fontSize: 13, color: T.ink, marginBottom: 20 }}>{subtitle}</div>
        <Card>
          {category === "income" ? (
            <IncomeDetail months={months} />
          ) : category === "activity" ? (
            <ActivityDetail months={months} />
          ) : (
            <ExpectedDetail monthIndex={monthIndex} />
          )}
        </Card>
      </div>
    </div>
  );
}

export default function MonthPage() {
  return (
    <Suspense fallback={null}>
      <MonthContent />
    </Suspense>
  );
}
