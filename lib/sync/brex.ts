import { createServiceClient } from "@/lib/supabase/service";
import { fetchBrexAccounts, fetchBrexCardBalanceCents, fetchBrexTransactions, type BrexAccount, type BrexTxn } from "@/lib/brex";

// Brex sync, callable in-process like the IBKR one. Each Brex cash account
// becomes one Cash holding under the single Brex account row.

type ExistingHolding = { symbol: string; is_manual: boolean };

type HoldingWrite = {
  account_id: string;
  symbol: string;
  name: string;
  qty: null;
  cost_basis_cents: number;
  value_cents: number;
  asset_class: "Cash";
  sector: string;
  geo: string;
  yield_pct: number;
  is_manual: false;
  updated_at: string;
};

type TxnWrite = {
  external_id: string;
  date: string;
  type: string;
  symbol: null;
  amount_cents: number;
  description: string;
};

const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export type BrexPlan = {
  account: { id: string; name: string };
  accounts: BrexAccount[];
  upserts: HoldingWrite[];
  liabilities: { name: string; amount_cents: number }[];
  deletes: { symbol: string; reason: string }[];
  newTransactions: TxnWrite[];
  alreadyRecordedTransactions: number;
  warnings: string[];
};

type Supabase = ReturnType<typeof createServiceClient>;

async function buildPlan(
  supabase: Supabase,
  accounts: BrexAccount[],
  txns: BrexTxn[],
  cardBalanceCents: number
): Promise<BrexPlan> {
  const warnings: string[] = [];

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("institution", "Brex")
    .single();
  if (error || !account) throw new Error(`No accounts row with institution='Brex': ${error?.message ?? "not found"}`);

  const { data: existingRaw } = await supabase
    .from("holdings")
    .select("symbol, is_manual")
    .eq("account_id", account.id)
    .returns<ExistingHolding[]>();
  const existing = existingRaw ?? [];

  const nonUsd = accounts.filter((a) => a.currency.toUpperCase() !== "USD");
  if (nonUsd.length) {
    warnings.push(`${nonUsd.length} Brex account(s) not USD; recorded as reported without FX conversion`);
  }

  const now = new Date().toISOString();
  // Symbol is the account name, so "Treasury" and "Primary checking" stay
  // recognisable in the holdings table.
  const upserts: HoldingWrite[] = accounts
    .filter((a) => a.status === "ACTIVE")
    .map((a) => ({
      account_id: account.id,
      symbol: a.name,
      name: a.accountNumberLast4 ? `${a.name} ··${a.accountNumberLast4}` : a.name,
      qty: null,
      // Cash has no cost basis distinct from its balance.
      cost_basis_cents: a.balanceCents,
      value_cents: a.balanceCents,
      asset_class: "Cash",
      sector: "Cash",
      geo: "United States",
      yield_pct: 0,
      is_manual: false,
      updated_at: now,
    }));

  const synced = new Set(upserts.map((u) => u.symbol));
  const deletes = existing
    .filter((h) => !synced.has(h.symbol))
    .map((h) => ({
      symbol: h.symbol,
      reason: h.is_manual ? "seeded estimate, superseded by the Brex API" : "no longer reported by Brex",
    }));

  const ids = txns.map((t) => t.externalId);
  let known = new Set<string>();
  if (ids.length) {
    const { data: found } = await supabase
      .from("transactions")
      .select("external_id")
      .in("external_id", ids)
      .returns<{ external_id: string }[]>();
    known = new Set((found ?? []).map((r) => r.external_id));
  }

  const newTransactions: TxnWrite[] = txns
    .filter((t) => !known.has(t.externalId))
    .map((t) => ({
      external_id: t.externalId,
      date: t.date,
      type: t.type,
      symbol: null,
      amount_cents: t.amountCents,
      description: t.description,
    }));

  const liabilities = cardBalanceCents > 0 ? [{ name: "Brex charge card", amount_cents: cardBalanceCents }] : [];

  return {
    account: { id: account.id, name: account.name },
    accounts,
    upserts,
    liabilities,
    deletes,
    newTransactions,
    alreadyRecordedTransactions: known.size,
    warnings,
  };
}

export function summariseBrexPlan(plan: BrexPlan) {
  return {
    target: "brex",
    dryRun: true,
    account: plan.account,
    balances: plan.upserts.map((u) => ({ symbol: u.symbol, name: u.name, value: money(u.value_cents) })),
    total: money(plan.upserts.reduce((s, u) => s + u.value_cents, 0)),
    liabilities: plan.liabilities.map((l) => ({ name: l.name, amount: money(l.amount_cents) })),
    wouldDelete: plan.deletes,
    wouldInsertTransactions: plan.newTransactions.length,
    transactionsByType: plan.newTransactions.reduce<Record<string, number>>((acc, t) => {
      acc[t.type] = (acc[t.type] ?? 0) + 1;
      return acc;
    }, {}),
    transactionSample: plan.newTransactions.slice(0, 15).map((t) => ({
      date: t.date,
      type: t.type,
      amount: money(t.amount_cents),
      description: t.description,
    })),
    alreadyRecordedTransactions: plan.alreadyRecordedTransactions,
    warnings: plan.warnings,
  };
}

export async function runBrexSync({ dryRun = false }: { dryRun?: boolean } = {}) {
  const token = process.env.BREX_API_TOKEN;
  if (!token) throw new Error("BREX_API_TOKEN not set");
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

  const accounts = await fetchBrexAccounts(token);
  const fetched = await Promise.all(
    accounts.filter((a) => a.status === "ACTIVE").map((a) => fetchBrexTransactions(token, a.id))
  );
  const txns = fetched.flatMap((f) => f.transactions);
  const skippedInternal = fetched.reduce((s, f) => s + f.skippedInternal, 0);
  const cardBalanceCents = await fetchBrexCardBalanceCents(token).catch(() => 0);

  const supabase = createServiceClient();
  const plan = await buildPlan(supabase, accounts, txns, cardBalanceCents);
  if (skippedInternal) {
    plan.warnings.push(
      `${skippedInternal} internal checking<->Treasury transfer(s) skipped — both legs are the same money, so recording them would double-count`
    );
  }
  if (dryRun) return summariseBrexPlan(plan);

  // An empty account list would otherwise wipe every Brex holding.
  if (plan.upserts.length === 0) {
    throw new Error("Brex returned no active accounts — refusing to write, as that would delete every Brex holding");
  }

  const applied = { balances: 0, deleted: 0, transactions: 0, liabilities: 0 };

  const { error: upsertErr } = await supabase.from("holdings").upsert(plan.upserts, { onConflict: "account_id,symbol" });
  if (upsertErr) throw new Error(`Brex holdings upsert failed: ${upsertErr.message}`);
  applied.balances = plan.upserts.length;

  for (const l of plan.liabilities) {
    // Keyed on name so re-syncing updates the balance rather than duplicating.
    const { data: found } = await supabase.from("liabilities").select("id").eq("name", l.name).maybeSingle();
    const row = { ...l, updated_at: new Date().toISOString() };
    const { error: liabErr } = found?.id
      ? await supabase.from("liabilities").update(row).eq("id", found.id)
      : await supabase.from("liabilities").insert(row);
    if (liabErr) throw new Error(`Brex liability write failed: ${liabErr.message}`);
    applied.liabilities += 1;
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
    if (delErr) throw new Error(`Stale Brex holdings delete failed: ${delErr.message}`);
    applied.deleted = plan.deletes.length;
  }

  if (plan.newTransactions.length) {
    const { error: txnErr } = await supabase
      .from("transactions")
      .upsert(
        plan.newTransactions.map((t) => ({ ...t, account_id: plan.account.id })),
        { onConflict: "external_id" }
      );
    if (txnErr) throw new Error(`Brex transaction insert failed: ${txnErr.message}`);
    applied.transactions = plan.newTransactions.length;
  }

  return { target: "brex", dryRun: false, account: plan.account, applied, warnings: plan.warnings };
}
