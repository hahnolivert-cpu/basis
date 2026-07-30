// Plaid API client. Only ever called server-side — the client_id/secret must
// never reach the browser, and access tokens stay in the plaid_items table.

const ENV_HOSTS: Record<string, string> = {
  production: "https://production.plaid.com",
  sandbox: "https://sandbox.plaid.com",
};

function config() {
  const clientId = process.env.PLAID_CLIENT_ID;
  const secret = process.env.PLAID_SECRET;
  const env = process.env.PLAID_ENV ?? "production";
  if (!clientId || !secret) throw new Error("PLAID_CLIENT_ID and PLAID_SECRET must both be set");
  const host = ENV_HOSTS[env];
  if (!host) throw new Error(`Unsupported PLAID_ENV "${env}" (expected production or sandbox)`);
  return { clientId, secret, host };
}

async function plaidPost<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const { clientId, secret, host } = config();
  const res = await fetch(`${host}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, secret, ...body }),
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok || json.error_code) {
    throw new Error(`Plaid ${path}: ${json.error_code ?? res.status} — ${json.error_message ?? "unknown error"}`);
  }
  return json as T;
}

// Chase is a depository account and Robinhood an investment one, so each needs
// its own product set — asking for investments on a checking account yields no
// linkable accounts.
export type LinkProduct = "transactions" | "investments";

export async function createLinkToken(products: LinkProduct[], userId = "basis-single-user") {
  return plaidPost<{ link_token: string; expiration: string }>("/link/token/create", {
    client_name: "Basis",
    language: "en",
    country_codes: ["US"],
    user: { client_user_id: userId },
    products,
  });
}

export async function exchangePublicToken(publicToken: string) {
  return plaidPost<{ access_token: string; item_id: string }>("/item/public_token/exchange", {
    public_token: publicToken,
  });
}

export type PlaidAccount = {
  account_id: string;
  name: string;
  official_name: string | null;
  mask: string | null;
  type: string;
  subtype: string | null;
  balances: { current: number | null; available: number | null; iso_currency_code: string | null };
};

export async function getAccounts(accessToken: string) {
  return plaidPost<{ accounts: PlaidAccount[]; item: { institution_id: string | null } }>("/accounts/get", {
    access_token: accessToken,
  });
}

export type PlaidSecurity = {
  security_id: string;
  ticker_symbol: string | null;
  name: string | null;
  type: string | null;
  close_price: number | null;
  iso_currency_code: string | null;
};

export type PlaidHolding = {
  account_id: string;
  security_id: string;
  quantity: number;
  institution_price: number | null;
  institution_value: number | null;
  cost_basis: number | null;
  iso_currency_code: string | null;
};

export async function getInvestmentHoldings(accessToken: string) {
  return plaidPost<{ accounts: PlaidAccount[]; holdings: PlaidHolding[]; securities: PlaidSecurity[] }>(
    "/investments/holdings/get",
    { access_token: accessToken }
  );
}

export type PlaidInvestmentTransaction = {
  investment_transaction_id: string;
  security_id: string | null;
  date: string; // YYYY-MM-DD
  name: string;
  quantity: number;
  amount: number; // Plaid convention: positive = cash debited (e.g. a buy), negative = cash credited
  price: number;
  type: string; // "buy" | "sell" | "cash" | "fee" | "transfer" | "cancel"
  subtype: string;
};

// Paginated per Plaid's offset/count convention (unlike /transactions/sync,
// investment transactions have no cursor endpoint).
export async function getInvestmentTransactions(accessToken: string, startDate: string, endDate: string) {
  const count = 500;
  let offset = 0;
  let all: PlaidInvestmentTransaction[] = [];
  let securities: PlaidSecurity[] = [];
  for (;;) {
    const res = await plaidPost<{
      investment_transactions: PlaidInvestmentTransaction[];
      securities: PlaidSecurity[];
      total_investment_transactions: number;
    }>("/investments/transactions/get", {
      access_token: accessToken,
      start_date: startDate,
      end_date: endDate,
      options: { count, offset },
    });
    all = all.concat(res.investment_transactions);
    if (res.securities.length) securities = res.securities;
    offset += res.investment_transactions.length;
    if (res.investment_transactions.length === 0 || all.length >= res.total_investment_transactions) break;
  }
  return { investment_transactions: all, securities };
}

// Maps a Plaid security type onto our asset_class enum. Plaid uses
// "cash"/"equity"/"etf"/"mutual fund"/"cryptocurrency"/"derivative"/"fixed income".
export function assetClassForSecurity(type: string | null, ticker: string | null): "Cash" | "Equities" | "Crypto" {
  const t = (type ?? "").toLowerCase();
  if (t.includes("crypto")) return "Crypto";
  if (t === "cash") return "Cash";
  // Plaid sometimes types crypto as "equity"; fall back to a ticker heuristic.
  if (ticker && /^(BTC|ETH|SOL|LINK|HYPE|DOGE|ADA|XRP)$/i.test(ticker)) return "Crypto";
  return "Equities";
}
