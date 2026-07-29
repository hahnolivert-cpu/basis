export type AssetClass = "Cash" | "Equities" | "Crypto";
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
};

export type NamedValue = { name: string; value: number };
