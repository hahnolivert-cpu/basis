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
  type: "dividend" | "interest" | "transfer";
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

// Brex reports Treasury yield as type DIVIDEND (it is a money-market fund), not
// INTEREST — classifying only on /INTEREST/ silently filed every yield payment
// as a transfer and dropped it out of the income card.
function classify(rawType: string): BrexTxn["type"] {
  if (/DIVIDEND/i.test(rawType)) return "dividend";
  if (/INTEREST/i.test(rawType)) return "interest";
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
