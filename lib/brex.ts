// Brex API client (native, not via Plaid — Plaid exposes no Investments product
// for Brex and the native API also yields transactions).
//
// IMPORTANT: Brex reports money in MINOR UNITS. `{"amount": 264004}` is
// $2,640.04, already cents. Our schema stores cents, so amounts pass straight
// through — multiplying by 100 would inflate every balance 100x.

const BASE = "https://platform.brexapis.com";

export type BrexAccount = {
  id: string;
  name: string;
  status: string;
  currency: string;
  balanceCents: number;
  accountNumberLast4: string | null;
};

export type BrexTxn = {
  externalId: string;
  date: string; // YYYY-MM-DD
  type: "interest" | "transfer";
  amountCents: number;
  description: string;
  rawType: string;
};

async function brexGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Brex ${path} returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type RawAccount = {
  id: string;
  name: string;
  status: string;
  current_balance?: { amount?: number; currency?: string };
  account_number?: string;
};

export async function fetchBrexAccounts(token: string): Promise<BrexAccount[]> {
  const json = await brexGet<{ items?: RawAccount[] }>("/v2/accounts/cash", token);
  return (json.items ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    status: a.status,
    currency: a.current_balance?.currency ?? "USD",
    balanceCents: Math.round(a.current_balance?.amount ?? 0),
    accountNumberLast4: a.account_number ? a.account_number.slice(-4) : null,
  }));
}

type RawCardAccount = { id: string; status: string; current_balance?: { amount?: number; currency?: string } };

// `/v2/accounts/card` returns the live current balance for the statement
// period in progress — unlike `/v2/accounts/card/primary/statements`, whose
// most recent entry is the *last closed* statement and runs weeks stale.
// Charge cards owe whatever's currently outstanding, not last month's total.
export async function fetchBrexCardBalanceCents(token: string): Promise<number> {
  const accounts = await brexGet<RawCardAccount[]>("/v2/accounts/card", token);
  return accounts.filter((a) => a.status === "ACTIVE").reduce((s, a) => s + Math.round(a.current_balance?.amount ?? 0), 0);
}

// Brex reports Treasury yield as type DIVIDEND (it is technically a
// money-market fund), but economically it's the cash sweep yield — the same
// thing IBKR and Robinhood report as interest — so it's classified as
// interest here rather than a dividend, to stay consistent with the rest of
// the income ledger.
function classify(rawType: string): BrexTxn["type"] {
  if (/DIVIDEND|INTEREST/i.test(rawType)) return "interest";
  return "transfer";
}

// Money moved between the user's own Brex accounts (checking <-> Treasury) is
// not a net-worth event: the two legs cancel. Recording them would swamp the
// ledger and distort any future contribution/XIRR calculation.
const INTERNAL_TYPES = /INTRA_CUSTOMER_ACCOUNT_BOOK_TRANSFER/i;

type RawTxn = {
  id: string;
  description?: string;
  amount?: { amount?: number; currency?: string };
  initiated_at_date?: string;
  posted_at_date?: string;
  type?: string;
};

export type BrexCardTxn = {
  externalId: string;
  date: string; // YYYY-MM-DD
  description: string;
  amountCents: number; // positive = purchase, negative = refund/chargeback
  mcc: string | null;
};

type RawCardTxn = {
  id: string;
  description?: string;
  amount?: { amount?: number; currency?: string };
  initiated_at_date?: string;
  posted_at_date?: string;
  type?: string; // PURCHASE | REFUND | CHARGEBACK | COLLECTION
  merchant?: { raw_descriptor?: string; mcc?: string };
};

// "COLLECTION" is Brex debiting the linked bank account to pay down the card
// balance — a transfer, not spend (mirrors excluding Capital One's
// "Payment/Credit" rows). PURCHASE/REFUND/CHARGEBACK amounts already come
// back correctly signed (positive spend, negative credit).
const NON_SPEND_CARD_TXN_TYPES = new Set(["COLLECTION"]);

// Card transactions are a distinct feed from cash account transactions
// (`fetchBrexTransactions` above) — this is actual card purchases/refunds,
// with per-merchant MCC codes, not interest/internal transfers.
export async function fetchBrexCardTransactions(
  token: string,
  { pages = 5, limit = 100 }: { pages?: number; limit?: number } = {}
): Promise<BrexCardTxn[]> {
  const out: BrexCardTxn[] = [];
  let cursor: string | undefined;

  for (let page = 0; page < pages; page++) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set("cursor", cursor);
    const json = await brexGet<{ items?: RawCardTxn[]; next_cursor?: string | null }>(
      `/v2/transactions/card/primary?${qs}`,
      token
    );

    for (const t of json.items ?? []) {
      const date = (t.posted_at_date ?? t.initiated_at_date ?? "").slice(0, 10);
      if (!t.id || !date || !t.type || NON_SPEND_CARD_TXN_TYPES.has(t.type)) continue;
      out.push({
        externalId: `brex:card:${t.id}`,
        date,
        description: t.description || t.merchant?.raw_descriptor || "Brex card transaction",
        amountCents: Math.round(t.amount?.amount ?? 0),
        mcc: t.merchant?.mcc ?? null,
      });
    }

    if (!json.next_cursor) break;
    cursor = json.next_cursor;
  }

  return out;
}

export async function fetchBrexTransactions(
  token: string,
  accountId: string,
  {
    pages = 3,
    limit = 100,
    includeInternalTransfers = false,
  }: { pages?: number; limit?: number; includeInternalTransfers?: boolean } = {}
): Promise<{ transactions: BrexTxn[]; skippedInternal: number }> {
  const out: BrexTxn[] = [];
  let skippedInternal = 0;
  let cursor: string | undefined;

  for (let page = 0; page < pages; page++) {
    const qs = new URLSearchParams({ limit: String(limit) });
    if (cursor) qs.set("cursor", cursor);
    const json = await brexGet<{ items?: RawTxn[]; next_cursor?: string | null }>(
      `/v2/transactions/cash/${encodeURIComponent(accountId)}?${qs}`,
      token
    );

    for (const t of json.items ?? []) {
      const date = (t.posted_at_date ?? t.initiated_at_date ?? "").slice(0, 10);
      if (!t.id || !date) continue;
      const rawType = t.type ?? "";
      if (!includeInternalTransfers && INTERNAL_TYPES.test(rawType)) {
        skippedInternal++;
        continue;
      }
      out.push({
        externalId: `brex:txn:${t.id}`,
        date,
        type: classify(rawType),
        amountCents: Math.round(t.amount?.amount ?? 0),
        description: t.description || rawType || "Brex transaction",
        rawType,
      });
    }

    if (!json.next_cursor) break;
    cursor = json.next_cursor;
  }

  return { transactions: out, skippedInternal };
}
