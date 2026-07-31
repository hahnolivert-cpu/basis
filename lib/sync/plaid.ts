import { safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";
import {
  assetClassForSecurity,
  getAccounts,
  getInvestmentHoldings,
  getInvestmentTransactions,
  type PlaidAccount,
} from "@/lib/plaid";

// Plaid sync for Chase (depository) and Robinhood (investments).
//
// Each linked item is queried two ways: /accounts/get always, for cash
// balances, and /investments/holdings/get where the item supports it. An item
// linked with only the transactions product will fail the second call, which is
// expected and recorded rather than treated as an error.

type ExistingHolding = { symbol: string; sector: string | null; geo: string | null; yield_pct: number; is_manual: boolean };

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

// Investment-transaction history only goes back this far — plenty for
// estimating a recurring monthly contribution rate without pulling a
// decade of noise.
const TXN_LOOKBACK_DAYS = 730;

// Maps Plaid's type/subtype pair onto our transactions.type enum. Returns
// null for categories deliberately not recorded (e.g. a cancelled order).
function mapPlaidInvTxnType(type: string, subtype: string): TxnWrite["type"] | null {
  const t = `${type} ${subtype}`.toLowerCase();
  if (t.includes("buy")) return "buy";
  if (t.includes("sell")) return "sell";
  if (t.includes("withholding")) return "withholding_tax";
  if (t.includes("dividend")) return "dividend";
  if (t.includes("interest")) return "interest";
  if (t.includes("deposit") || t.includes("contribution") || t.includes("withdrawal") || t.includes("distribution") || t.includes("transfer")) return "transfer";
  if (t.includes("fee") || t.includes("tax")) return "transfer";
  return null; // e.g. "cancel"
}

// Last-resort fallback for a buy/sell whose security_id couldn't be resolved
// through either securities list (see the `sec` lookup below). Plaid's own
// human-readable name for crypto, options, and dividend-reinvestment rows
// puts the ticker directly in the text ("buy 36.365800 HYPE for $41.25
// each", "GLNK call with strike...", "5.588 shares of NVO for..."), so it
// can be recovered from there. Ordinary equity/ETF buys instead spell out
// the full company name ("shares of Microsoft for...") with no ticker
// anywhere in the string, so those are left null rather than guessed at.
function extractTickerFromPlaidName(name: string): string | null {
  return (
    name.match(/[\d.]+ ([A-Z][A-Z0-9]{0,9}) (?:call|put)\b/)?.[1] ??
    name.match(/shares of ([A-Z][A-Z0-9.]{0,9}) for/)?.[1] ??
    name.match(/[\d.]+ ([A-Z][A-Z0-9]{0,9}) for \$/)?.[1] ??
    null
  );
}

type ItemRow = { institution: string; access_token: string };

export type PlaidInstitutionPlan = {
  institution: string;
  accountId: string;
  upserts: HoldingWrite[];
  liabilities: { name: string; amount_cents: number }[];
  deletes: { symbol: string; reason: string }[];
  newTransactions: TxnWrite[];
  alreadyRecordedTransactions: number;
  noCostBasis: string[];
  warnings: string[];
};

type Supabase = ReturnType<typeof createServiceClient>;

// Only depository accounts are assets. A credit account's balance is money
// OWED — counting it as cash overstates net worth by twice the balance, so those
// go to the liabilities table instead.
const isDepository = (a: PlaidAccount) => a.type === "depository";
const isCredit = (a: PlaidAccount) => a.type === "credit";

async function planForItem(supabase: Supabase, item: ItemRow): Promise<PlaidInstitutionPlan> {
  const warnings: string[] = [];
  const noCostBasis: string[] = [];

  const { data: account, error } = await supabase
    .from("accounts")
    .select("id, name")
    .eq("institution", item.institution)
    .single();
  if (error || !account) {
    throw new Error(`No accounts row with institution='${item.institution}': ${error?.message ?? "not found"}`);
  }

  const { data: existingRaw } = await supabase
    .from("holdings")
    .select("symbol, sector, geo, yield_pct, is_manual")
    .eq("account_id", account.id)
    .returns<ExistingHolding[]>();
  const existing = existingRaw ?? [];
  const bySymbol = new Map(existing.map((h) => [h.symbol, h]));

  const now = new Date().toISOString();
  const upserts: HoldingWrite[] = [];

  // Cash / depository balances.
  const { accounts } = await getAccounts(item.access_token);
  for (const a of accounts.filter(isDepository)) {
    const balance = a.balances.current ?? a.balances.available ?? 0;
    const symbol = a.mask ? `${a.name} ··${a.mask}` : a.name;
    const prior = bySymbol.get(symbol);
    upserts.push({
      account_id: account.id,
      symbol,
      name: a.official_name ?? a.name,
      qty: null,
      cost_basis_cents: cents(balance),
      value_cents: cents(balance),
      asset_class: "Cash",
      sector: "Cash",
      geo: "United States",
      yield_pct: prior?.yield_pct ?? 0,
      is_manual: false,
      updated_at: now,
    });
  }

  // Credit balances are debts, not assets.
  const liabilities = accounts.filter(isCredit).map((a) => ({
    name: `${item.institution} ${a.name}${a.mask ? ` ··${a.mask}` : ""}`,
    amount_cents: cents(Math.abs(a.balances.current ?? 0)),
  }));

  // Investment holdings and transaction history, where the item supports
  // the product. An item linked with only the transactions product fails
  // both calls, which is expected and recorded rather than treated as an
  // error.
  let marginCents = 0;
  let newTransactions: TxnWrite[] = [];
  let alreadyRecordedTransactions = 0;
  try {
    const { holdings, securities } = await getInvestmentHoldings(item.access_token);
    const secById = new Map(securities.map((s) => [s.security_id, s]));

    for (const h of holdings) {
      const sec = secById.get(h.security_id);
      if (!sec) {
        warnings.push(`holding referenced unknown security_id ${h.security_id}`);
        continue;
      }
      const symbol = (sec.ticker_symbol || sec.name || sec.security_id).trim();
      const assetClass = assetClassForSecurity(sec.type, sec.ticker_symbol);
      const value = h.institution_value ?? (h.institution_price ?? sec.close_price ?? 0) * h.quantity;

      // A negative "cash" security is margin debt (negative buying power),
      // not an asset — Plaid reports it this way rather than as a separate
      // liability. Route it to liabilities like a Plaid credit-account
      // balance instead of letting it sit inside Cash and understate net
      // worth silently.
      if (assetClass === "Cash" && value < 0) {
        marginCents += cents(Math.abs(value));
        continue;
      }

      // Plaid often omits cost basis; recording 0 would show a fake 100% gain,
      // so fall back to market value (gain reads as zero) and report it.
      let costBasis = h.cost_basis;
      if (costBasis === null || costBasis === undefined) {
        noCostBasis.push(symbol);
        costBasis = value;
      }

      // Closed positions come back as zero/zero; recording them adds noise.
      if (!h.quantity && !value) continue;

      const prior = bySymbol.get(symbol);
      upserts.push({
        account_id: account.id,
        symbol,
        name: sec.name ?? symbol,
        qty: h.quantity,
        cost_basis_cents: cents(costBasis),
        value_cents: cents(value),
        asset_class: assetClass,
        sector: prior?.sector ?? null,
        geo: prior?.geo ?? null,
        yield_pct: prior?.yield_pct ?? 0,
        is_manual: false,
        updated_at: now,
      });
    }
    if (marginCents > 0) liabilities.push({ name: `${item.institution} margin balance`, amount_cents: marginCents });

    // Purchase history, used to infer a recurring-contribution rate for
    // scenario planning. Kept in its own try/catch so a transactions-specific
    // failure doesn't discard the holdings already parsed above.
    try {
      const end = new Date().toISOString().slice(0, 10);
      const start = new Date(Date.now() - TXN_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
      const { investment_transactions, securities: txnSecurities } = await getInvestmentTransactions(item.access_token, start, end);
      const txnSecById = new Map(txnSecurities.map((s) => [s.security_id, s]));

      const ids = investment_transactions.map((t) => `plaid:${item.institution}:${t.investment_transaction_id}`);
      let known = new Set<string>();
      if (ids.length) {
        const { data: found } = await supabase
          .from("transactions")
          .select("external_id")
          .in("external_id", ids)
          .returns<{ external_id: string }[]>();
        known = new Set((found ?? []).map((r) => r.external_id));
      }
      alreadyRecordedTransactions = known.size;

      // Upserts every transaction Plaid returns in the lookback window, not
      // just ones unseen before — same reasoning as the IBKR sync: a
      // "skip if known" filter would leave qty/price_cents permanently null
      // on any row recorded before those columns existed, since a normal
      // sync never re-visits a transaction it already has.
      newTransactions = investment_transactions
        .map((t) => {
          const type = mapPlaidInvTxnType(t.type, t.subtype);
          const externalId = `plaid:${item.institution}:${t.investment_transaction_id}`;
          if (!type) return null;
          // The transactions call's own `securities` bundle occasionally fails to
          // resolve a security_id — most often for something bought too recently
          // for Plaid to have indexed yet — even though the holdings call above
          // resolves the same security_id fine, so fall back to that map before
          // giving up and trying the description text.
          const sec = t.security_id ? txnSecById.get(t.security_id) ?? secById.get(t.security_id) : undefined;
          const descriptionTicker = type === "buy" || type === "sell" ? extractTickerFromPlaidName(t.name) : null;
          return {
            external_id: externalId,
            date: t.date,
            type,
            symbol: (sec?.ticker_symbol || sec?.name || descriptionTicker || null)?.trim() || null,
            // Plaid signs a buy positive (cash debited) and a sell negative
            // (cash credited) — the opposite of the netCash convention
            // already stored for IBKR (buy negative, sell positive).
            // Flipping here keeps one consistent sign across providers.
            amount_cents: cents(-t.amount),
            description: t.name,
            qty: type === "buy" || type === "sell" ? Math.abs(t.quantity) : null,
            price_cents: type === "buy" || type === "sell" ? cents(t.price) : null,
          };
        })
        .filter((t): t is TxnWrite => t !== null);
    } catch (e) {
      warnings.push(`no investment transactions for ${item.institution} — ${safeMessage(e)}`);
    }
  } catch (e) {
    warnings.push(
      `no investment holdings for ${item.institution} — ${safeMessage(e)}`
    );
  }

  const synced = new Set(upserts.map((u) => u.symbol));
  const deletes = existing
    .filter((h) => !synced.has(h.symbol))
    .map((h) => ({
      symbol: h.symbol,
      reason: h.is_manual ? "seeded estimate, superseded by Plaid" : "no longer reported by Plaid",
    }));

  if (noCostBasis.length) {
    warnings.push(
      `${noCostBasis.length} position(s) came back without cost basis (${noCostBasis.slice(0, 6).join(", ")}${
        noCostBasis.length > 6 ? "…" : ""
      }); cost set equal to market value, so their gain shows as zero rather than a fabricated figure`
    );
  }

  return {
    institution: item.institution,
    accountId: account.id,
    upserts,
    liabilities,
    deletes,
    newTransactions,
    alreadyRecordedTransactions,
    noCostBasis,
    warnings,
  };
}

export async function runPlaidSync({ dryRun = false }: { dryRun?: boolean } = {}) {
  if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
    throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must both be set");
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error("SUPABASE_SERVICE_ROLE_KEY not set");

  const supabase = createServiceClient();
  const { data: items, error } = await supabase
    .from("plaid_items")
    .select("institution, access_token")
    .returns<ItemRow[]>();
  if (error) throw new Error(`Could not read plaid_items: ${error.message}`);

  if (!items?.length) {
    return { target: "plaid", dryRun, linkedInstitutions: 0, note: "No institutions linked yet — visit /link" };
  }

  const plans = await Promise.all(items.map((i) => planForItem(supabase, i)));

  if (dryRun) {
    return {
      target: "plaid",
      dryRun: true,
      institutions: plans.map((p) => ({
        institution: p.institution,
        positions: p.upserts.map((u) => ({
          symbol: u.symbol,
          name: u.name,
          qty: u.qty,
          cost: money(u.cost_basis_cents),
          value: money(u.value_cents),
          asset_class: u.asset_class,
        })),
        total: money(p.upserts.reduce((s, u) => s + u.value_cents, 0)),
        liabilities: p.liabilities.map((l) => ({ name: l.name, amount: money(l.amount_cents) })),
        wouldDelete: p.deletes,
        wouldInsertTransactions: p.newTransactions.length,
        transactionSample: p.newTransactions.slice(0, 25).map((t) => ({
          date: t.date,
          type: t.type,
          symbol: t.symbol,
          amount: money(t.amount_cents),
          description: t.description,
        })),
        alreadyRecordedTransactions: p.alreadyRecordedTransactions,
        warnings: p.warnings,
      })),
    };
  }

  const applied = { positions: 0, deleted: 0, liabilities: 0, transactions: 0 };
  const warnings: string[] = [];

  for (const plan of plans) {
    warnings.push(...plan.warnings.map((w) => `${plan.institution}: ${w}`));

    // Never let an empty response wipe an account.
    if (plan.upserts.length === 0) {
      warnings.push(`${plan.institution}: returned no accounts or holdings — left untouched`);
      continue;
    }

    const { error: upsertErr } = await supabase
      .from("holdings")
      .upsert(plan.upserts, { onConflict: "account_id,symbol" });
    if (upsertErr) throw new Error(`${plan.institution} holdings upsert failed: ${upsertErr.message}`);
    applied.positions += plan.upserts.length;

    for (const l of plan.liabilities) {
      // Keyed on name so re-syncing updates the balance rather than duplicating.
      const { data: found } = await supabase.from("liabilities").select("id").eq("name", l.name).maybeSingle();
      const row = { ...l, updated_at: new Date().toISOString() };
      const { error: liabErr } = found?.id
        ? await supabase.from("liabilities").update(row).eq("id", found.id)
        : await supabase.from("liabilities").insert(row);
      if (liabErr) throw new Error(`${plan.institution} liability write failed: ${liabErr.message}`);
      applied.liabilities += 1;
    }

    if (plan.deletes.length) {
      const { error: delErr } = await supabase
        .from("holdings")
        .delete()
        .eq("account_id", plan.accountId)
        .in(
          "symbol",
          plan.deletes.map((d) => d.symbol)
        );
      if (delErr) throw new Error(`${plan.institution} stale delete failed: ${delErr.message}`);
      applied.deleted += plan.deletes.length;
    }

    if (plan.newTransactions.length) {
      const { error: txnErr } = await supabase
        .from("transactions")
        .upsert(
          plan.newTransactions.map((t) => ({ ...t, account_id: plan.accountId })),
          { onConflict: "external_id" }
        );
      if (txnErr) throw new Error(`${plan.institution} transaction insert failed: ${txnErr.message}`);
      applied.transactions += plan.newTransactions.length;
    }
  }

  return { target: "plaid", dryRun: false, linkedInstitutions: plans.length, applied, warnings };
}
