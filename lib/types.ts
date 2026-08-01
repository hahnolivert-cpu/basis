export type AssetClass = "Cash" | "Equities" | "Crypto" | "Angel Investment";
export type Portfolio = "capital" | "personal";

export type Holding = {
  sym: string;
  qty?: number;
  name: string;
  pf: Portfolio;
  acct: string;
  cls: AssetClass;
  value: number;
  cost: number;
  day: number;
  sector?: string;
  geo?: string;
  etf?: string;
  yld: number;
  includedInNetWorth: boolean;
};

export type NamedValue = { name: string; value: number };

// One row of weekly_snapshots. Money is integer cents; usd_to_eur is EUR per
// USD (~0.86), so a EUR total is total_cents * usd_to_eur.
export type WeeklySnapshot = {
  sunday_date: string;
  crypto_cents: number;
  equities_cents: number;
  cash_cents: number;
  total_cents: number;
  usd_to_eur: number;
  btc_price_usd: number;
  source: "import" | "auto";
};
