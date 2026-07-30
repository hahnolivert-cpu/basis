import { createServiceClient } from "@/lib/supabase/service";
import { assetClassFor, fetchFlexStatement, type FlexStatement } from "@/lib/ibkr";

// IBKR Flex sync, callable in-process so the orchestrator and the weekly cron
// never have to make an authenticated HTTP call back into the app.

const CASH_SYMBOL = "IBKR Cash";

type ExistingHolding = {
  symbol: string;
  sector: string | null;
  geo: string | null;
  yield_pct: number;
  is_manual: boolean;
};

type HoldingWrite = {
  account_id: string;
  symbol: string;
  name: string;
  qty: number | null;
  cost_basis_cents: number;
  value_cents: number;
  asset_class: string;
  sector: string | null;
  geo: string | null;
  yield_pct: number;
  is_manual: boolean;
  updated_at: string;
};

type TxnWrite = {
  external_id: string;
  date: string;
  type: string;
  symbol: string | null;
  amount_cents: number;
  description: string;
  qty: number | null;
  price_cents: number | null;
};

const cents = (n: number) => Math.round(n * 100);
const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type IbkrPlan = {
  account: { id: string; name: string };
  statement: { accountId: string; fromDate: string | null; toDate: string | null };
  upserts: HoldingWrite[];
  cashUpdate: { value_cents: number; currencies: { currency: string; endingCash: number }[] } | null;
  usdToEur: number | null;
  deletes: { symbol: string; reason: string }[];
  newTransactions: TxnWrite[];
  alreadyRecordedTransactions: number;
  skipped: string[];
  warnings: string[];
};

type Supabase = ReturnType<typeof createServiceClient>;

async function buildPlan(supabase: Supabase, statement: FlexStatement): Promise<IbkrPlan> {
  const warnings: string[] = [];

  const { data: account, error: acctErr } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("institution", "IBKR")
    .single();
  if (acctErr || !account) {
    throw new Error(`No accounts row with institution='IBKR': ${acctErr?.message ?? "not found"}`);
  }

  const { data: existingRaw } = await supabase
    .from("holdings")
    .select("symbol, sector, geo, yield_pct, is_manual")
    .eq("account_id", account.id)
    .returns<ExistingHolding[]>();
  const existing = existingRaw ?? [];
  const bySymbol = new Map(existing.map((h) => [h.symbol, h]));

  const nonUsd = statement.positions.filter((p) => p.currency.toUpperCase() !== "USD");
  if (nonUsd.length) {
    warnings.push(
      `${nonUsd.length} position(s) not USD-denominated (${nonUsd
        .map((p) => `${p.symbol} ${p.currency}`)
        .join(", ")}); recorded as reported without FX conversion`
    );
  }

  const now = new Date().toISOString();
  const upserts: HoldingWrite[] = statement.positions
    .filter((p) => p.symbol)
    .map((p) => {
      const prior = bySymbol.get(p.symbol);
      return {
        account_id: account.id,
        symbol: p.symbol,
        name: p.description || p.symbol,
        qty: p.qty,
        cost_basis_cents: cents(p.costBasisMoney),
        value_cents: cents(p.positionValue),
        asset_class: assetClassFor(p.assetCategory) ?? "Equities",
        // Flex carries no sector/geo/yield, so preserve what the row already
        // had rather than blanking the composition charts.
        sector: prior?.sector ?? null,
        geo: prior?.geo ?? null,
        yield_pct: prior?.yield_pct ?? 0,
        is_manual: false,
        updated_at: now,
      };
    });

  // Prefer IBKR's BASE_SUMMARY, which is already FX-converted to the account's
  // base currency. Summing the per-currency rows would add EUR to USD as if
  // they were the same unit and understate the balance.
  let cashUpdate: IbkrPlan["cashUpdate"] = null;
  if (statement.cashBaseTotal !== null) {
    cashUpdate = { value_cents: cents(statement.cashBaseTotal), currencies: statement.cash };
  } else if (statement.cash.length) {
    const currencies = statement.cash.filter((c) => c.endingCash !== 0).map((c) => c.currency);
    if (currencies.length > 1) {
      warnings.push(
        `Flex returned no BASE_SUMMARY cash row and balances span ${currencies.join(", ")}; summed without FX conversion, so the cash figure is unreliable — enable the Cash Report "Base Currency Summary" option`
      );
    }
    cashUpdate = { value_cents: cents(statement.cash.reduce((s, c) => s + c.endingCash, 0)), currencies: statement.cash };
  }

  const synced = new Set([...upserts.map((u) => u.symbol), ...(cashUpdate ? [CASH_SYMBOL] : [])]);
  const deletes = existing
    .filter((h) => !synced.has(h.symbol))
    .map((h) => ({
      symbol: h.symbol,
      reason: h.is_manual ? "seeded estimate, not in Flex statement" : "previously synced, no longer reported",
    }));

  const ids = statement.transactions.map((t) => t.externalId);
  let known = new Set<string>();
  if (ids.length) {
    const { data: found } = await supabase
      .from("transactions")
      .select("external_id")
      .in("external_id", ids)
      .returns<{ external_id: string }[]>();
    known = new Set((found ?? []).map((r) => r.external_id));
  }

  const dated = statement.transactions.filter((t) => t.date);
  if (dated.length !== statement.transactions.length) {
    warnings.push(
      `${statement.transactions.length - dated.length} transaction(s) had an unparseable date and were dropped`
    );
  }

  const newTransactions: TxnWrite[] = dated
    .filter((t) => !known.has(t.externalId))
    .map((t) => ({
      external_id: t.externalId,
      date: t.date,
      type: t.type,
      symbol: t.symbol,
      amount_cents: cents(t.amount),
      description: t.description,
      qty: t.qty ?? null,
      price_cents: t.price !== undefined ? cents(t.price) : null,
    }));

  return {
    account: { id: account.id, name: account.name },
    statement: { accountId: statement.accountId, fromDate: statement.fromDate, toDate: statement.toDate },
    upserts,
    cashUpdate,
    usdToEur: statement.usdToEur,
    deletes,
    newTransactions,
    alreadyRecordedTransactions: known.size,
    skipped: statement.skipped,
    warnings,
  };
}

// Readable preview of what a write would do.
export function summarisePlan(plan: IbkrPlan) {
  return {
    target: "ibkr",
    dryRun: true,
    account: plan.account,
    statement: plan.statement,
    positions: plan.upserts.map((u) => ({
      symbol: u.symbol,
      name: u.name,
      qty: u.qty,
      cost: money(u.cost_basis_cents),
      value: money(u.value_cents),
      asset_class: u.asset_class,
    })),
    cash: plan.cashUpdate
      ? { total: money(plan.cashUpdate.value_cents), byCurrency: plan.cashUpdate.currencies }
      : null,
    usdToEur: plan.usdToEur,
    wouldDelete: plan.deletes,
    wouldInsertTransactions: plan.newTransactions.length,
    transactionSample: plan.newTransactions.slice(0, 25).map((t) => ({
      date: t.date,
      type: t.type,
      symbol: t.symbol,
      amount: money(t.amount_cents),
      description: t.description,
    })),
    alreadyRecordedTransactions: plan.alreadyRecordedTransactions,
    skipped: plan.skipped,
    warnings: plan.warnings,
  };
}

export async function planIbkrSync(): Promise<{ supabase: Supabase; plan: IbkrPlan }> {
  const token = process.env.IBKR_FLEX_TOKEN;
  const queryId = process.env.IBKR_FLEX_QUERY_ID;
  if (!token || !queryId) throw new Error("IBKR_FLEX_TOKEN and IBKR_FLEX_QUERY_ID must both be set");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

  const { statement } = await fetchFlexStatement(token, queryId);
  const supabase = createServiceClient();
  return { supabase, plan: await buildPlan(supabase, statement) };
}

export async function runIbkrSync({ dryRun = false }: { dryRun?: boolean } = {}) {
  const { supabase, plan } = await planIbkrSync();
  if (dryRun) return summarisePlan(plan);

  // An empty statement would otherwise delete every holding in the account.
  if (plan.upserts.length === 0 && !plan.cashUpdate) {
    throw new Error(
      "Statement contained no positions or cash — refusing to write, as that would delete every holding for this account"
    );
  }

  const applied = { positions: 0, cash: 0, deleted: 0, transactions: 0 };

  const { error: upsertErr } = await supabase.from("holdings").upsert(plan.upserts, { onConflict: "account_id,symbol" });
  if (upsertErr) throw new Error(`Holdings upsert failed: ${upsertErr.message}`);
  applied.positions = plan.upserts.length;

  if (plan.cashUpdate) {
    const { error: cashErr } = await supabase.from("holdings").upsert(
      {
        account_id: plan.account.id,
        symbol: CASH_SYMBOL,
        name: "IBKR cash balance",
        qty: null,
        cost_basis_cents: plan.cashUpdate.value_cents,
        value_cents: plan.cashUpdate.value_cents,
        asset_class: "Cash",
        sector: "Cash",
        geo: "United States",
        yield_pct: 0,
        is_manual: false,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,symbol" }
    );
    if (cashErr) throw new Error(`Cash upsert failed: ${cashErr.message}`);
    applied.cash = 1;
  }

  if (plan.deletes.length) {
    const { error: delErr } = await supabase
      .from("holdings")
      .delete()
      .eq("account_id", plan.account.id)
      .in(
        "symbol",
        plan.deletes.map((d) => d.symbol)
      );
    if (delErr) throw new Error(`Stale holdings delete failed: ${delErr.message}`);
    applied.deleted = plan.deletes.length;
  }

  if (plan.newTransactions.length) {
    const { error: txnErr } = await supabase
      .from("transactions")
      .upsert(
        plan.newTransactions.map((t) => ({ ...t, account_id: plan.account.id })),
        { onConflict: "external_id" }
      );
    if (txnErr) throw new Error(`Transaction insert failed: ${txnErr.message}`);
    applied.transactions = plan.newTransactions.length;
  }

  return {
    target: "ibkr",
    dryRun: false,
    account: plan.account,
    statement: plan.statement,
    usdToEur: plan.usdToEur,
    applied,
    skipped: plan.skipped,
    warnings: plan.warnings,
  };
}
