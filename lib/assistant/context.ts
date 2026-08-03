// Builds a bounded, read-only snapshot of the user's real financial data to
// inject into the assistant's system prompt. Aggregated, not raw — a full
// transaction dump would blow the token budget on every turn and cost
// scales with conversation length, not with portfolio size. If a question
// needs more granularity than the snapshot has, the assistant says so and
// points at the relevant tab rather than guessing.
import { createServiceClient } from "@/lib/supabase/service";
import { getDbHoldings } from "@/lib/holdings";
import { getQuotes } from "@/lib/market";
import { usd } from "@/lib/format";
import { formatTicker } from "@/lib/holdings";
import { personalRows, reimbursedRows, byCategory, monthKey, type SpendRow } from "@/lib/spending";

async function fetchAllSpendRows(): Promise<SpendRow[]> {
  const supabase = createServiceClient();
  const PAGE = 1000;
  const rows: SpendRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("card_spend")
      .select("id, source, card_last4, transaction_date, description, category, amount_cents, reimbursed_by")
      .order("transaction_date", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    rows.push(
      ...data.map((r) => ({
        id: r.id,
        source: r.source,
        cardLast4: r.card_last4,
        date: r.transaction_date,
        description: r.description,
        category: r.category,
        amountCents: r.amount_cents,
        reimbursedBy: r.reimbursed_by,
      }))
    );
    if (data.length < PAGE) break;
  }
  return rows;
}

export async function buildFinancialContext(): Promise<string> {
  const supabase = createServiceClient();
  const lines: string[] = [];

  // --- Holdings, repriced from live quotes the same way the dashboard is ---
  const [dbHoldings, quotes, { data: liabilities }, spendRows] = await Promise.all([
    getDbHoldings().catch(() => []),
    getQuotes().catch(() => null),
    supabase.from("liabilities").select("name, amount_cents").returns<{ name: string; amount_cents: number }[]>(),
    fetchAllSpendRows().catch(() => [] as SpendRow[]),
  ]);

  const holdings = dbHoldings
    .filter((h) => h.includedInNetWorth !== false)
    .map((h) => {
      const q = h.qty ? quotes?.quotes[h.sym] : undefined;
      return { ...h, value: q ? h.qty! * q.price : h.value };
    });

  const totalAssets = holdings.reduce((s, h) => s + h.value, 0);
  const debtsCents = (liabilities ?? []).reduce((s, l) => s + l.amount_cents, 0);
  const debts = debtsCents / 100;
  const netWorth = totalAssets - debts;
  const capital = holdings.filter((h) => h.pf === "capital").reduce((s, h) => s + h.value, 0);
  const personal = totalAssets - capital;

  lines.push(`# Net worth snapshot (as of ${new Date().toISOString().slice(0, 10)})`);
  lines.push(`Total net worth: ${usd(netWorth)} (assets ${usd(totalAssets)} minus debts ${usd(debts)})`);
  lines.push(`- 976 Capital: ${usd(capital)}`);
  lines.push(`- Personal: ${usd(personal)}`);
  if ((liabilities ?? []).length) {
    lines.push(`Debts: ${liabilities!.map((l) => `${l.name} ${usd(l.amount_cents / 100)}`).join(", ")}`);
  }

  const byClass = new Map<string, number>();
  for (const h of holdings) byClass.set(h.cls, (byClass.get(h.cls) ?? 0) + h.value);
  lines.push(
    `Asset class mix: ${Array.from(byClass.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([cls, v]) => `${cls} ${usd(v)} (${((v / totalAssets) * 100).toFixed(1)}%)`)
      .join(", ")}`
  );

  const estAnnualIncome = holdings.reduce((s, h) => s + (h.value * h.yld) / 100, 0);
  lines.push(`Estimated annual dividend/interest income (blended yield): ${usd(estAnnualIncome)}/yr`);

  const topHoldings = [...holdings].sort((a, b) => b.value - a.value).slice(0, 20);
  lines.push("");
  lines.push("## Top holdings by value");
  for (const h of topHoldings) {
    lines.push(
      `- ${formatTicker(h.sym)} (${h.cls}${h.sector ? `, ${h.sector}` : ""}${h.geo ? `, ${h.geo}` : ""}) — ${usd(h.value)} · ${h.pf === "capital" ? "976 Capital" : "Personal"} · ${h.acct}${h.yld ? ` · ${h.yld.toFixed(2)}% yield` : ""}`
    );
  }

  // --- Spending ---
  const personalSpend = personalRows(spendRows);
  const reimbursedSpend = reimbursedRows(spendRows);
  const now = new Date();
  const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const ytd = String(now.getFullYear());
  const personalThisMonth = personalSpend.filter((r) => monthKey(r.date) === thisMonth).reduce((s, r) => s + r.amountCents / 100, 0);
  const personalYtd = personalSpend.filter((r) => r.date.startsWith(ytd)).reduce((s, r) => s + r.amountCents / 100, 0);
  const reimbursedYtd = reimbursedSpend.filter((r) => r.date.startsWith(ytd)).reduce((s, r) => s + r.amountCents / 100, 0);
  const topCategories = byCategory(personalSpend.filter((r) => r.date.startsWith(ytd))).slice(0, 8);

  lines.push("");
  lines.push("## Spending (from imported card transactions)");
  lines.push(`Personal spend this month: ${usd(personalThisMonth)} · YTD: ${usd(personalYtd)}`);
  lines.push(`976 spend YTD (Brex + reimbursed personal charges): ${usd(reimbursedYtd)}`);
  if (topCategories.length) {
    lines.push(`Top personal spending categories YTD: ${topCategories.map((c) => `${c.name} ${usd(c.value)}`).join(", ")}`);
  }
  lines.push(
    "This snapshot is aggregated, not a full transaction log — for a specific past charge or merchant, say so and point the user at the Spending tab rather than guessing."
  );

  return lines.join("\n");
}
