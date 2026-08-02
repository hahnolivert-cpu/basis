"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { T, serif, sans } from "@/lib/theme";
import { monthLabel } from "@/lib/weekly";
import { Card } from "@/components/ui";
import { IncomeDetail, ActivityDetail, ExpectedDetail, MONTH_NAMES } from "@/components/MonthDrilldown";

// Standalone, direct-linkable version of the same "backup data" the chart
// cards now show as an in-page modal (components/MonthDrilldown.tsx) —
// kept around for a bookmarked/shared URL, not linked to from inside the
// app anymore now that bar clicks open the modal instead of this page.

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
