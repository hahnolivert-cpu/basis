import { safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";
import { assetClassForSecurity, getAccounts, getInvestmentHoldings, type PlaidAccount } from "@/lib/plaid";

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

const cents = (n: number) => Math.round(n * 100);
const money = (c: number) =>
  `$${(c / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type ItemRow = { institution: string; access_token: string };

export type PlaidInstitutionPlan = {
  institution: string;
  accountId: string;
  upserts: HoldingWrite[];
  deletes: { symbol: string; reason: string }[];
  noCostBasis: string[];
  warnings: string[];
};

type Supabase = ReturnType<typeof createServiceClient>;

const isDepository = (a: PlaidAccount) => a.type === "depository" || a.type === "credit";

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

  // Investment holdings, where the item supports the product.
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

      // Plaid often omits cost basis; recording 0 would show a fake 100% gain,
      // so fall back to market value (gain reads as zero) and report it.
      let costBasis = h.cost_basis;
      if (costBasis === null || costBasis === undefined) {
        noCostBasis.push(symbol);
        costBasis = value;
      }

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

  return { institution: item.institution, accountId: account.id, upserts, deletes, noCostBasis, warnings };
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
        wouldDelete: p.deletes,
        warnings: p.warnings,
      })),
    };
  }

  const applied = { positions: 0, deleted: 0 };
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
  }

  return { target: "plaid", dryRun: false, linkedInstitutions: plans.length, applied, warnings };
}
