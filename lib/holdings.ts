import { createServiceClient } from "./supabase/service";
import { ETF_DATA } from "./data";
import type { Holding, AssetClass, Portfolio } from "./types";

// Reads holdings out of Supabase and shapes them the way the dashboard
// components expect. Callable in-process so both /api/holdings and the market
// data layer can use it without crossing the auth middleware.

type Row = {
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
  accounts: { name: string; portfolio: string; institution: string } | null;
};

// Providers report tickers in their own dialects. Normalises to what the quote
// APIs expect: IBKR writes crypto as "BTC.USD-PAXOS" and share classes with a
// space ("BRK B"), while Finnhub wants a dot ("BRK.B").
const CRYPTO_BASES: Record<string, string> = {
  BTC: "bitcoin",
  ETH: "ethereum",
  SOL: "solana",
  LINK: "chainlink",
  HYPE: "hyperliquid",
};

export type QuoteRef = { type: "crypto"; id: string } | { type: "equity"; symbol: string } | null;

export function quoteRefFor(symbol: string, assetClass: string): QuoteRef {
  if (assetClass === "Cash") return null;

  // "BTC.USD-PAXOS" / "BTC" -> bitcoin
  const base = symbol.split(/[.\-/]/)[0].trim().toUpperCase();
  if (assetClass === "Crypto" || base in CRYPTO_BASES) {
    const id = CRYPTO_BASES[base];
    return id ? { type: "crypto", id } : null;
  }

  return { type: "equity", symbol: symbol.trim().replace(/\s+/g, ".") };
}

export type DbHolding = Holding & { isManual: boolean; dbSymbol: string };

function mapRow(r: Row): DbHolding {
  const cls = (["Cash", "Equities", "Crypto"].includes(r.asset_class) ? r.asset_class : "Equities") as AssetClass;
  return {
    sym: r.symbol,
    dbSymbol: r.symbol,
    qty: r.qty ?? undefined,
    name: r.name,
    pf: (r.accounts?.portfolio === "capital" ? "capital" : "personal") as Portfolio,
    acct: r.accounts?.name ?? "Unknown",
    cls,
    value: r.value_cents / 100,
    cost: r.cost_basis_cents / 100,
    // Day change comes from live quotes, applied client-side.
    day: 0,
    // Providers don't supply sector/geo. Label the gap rather than letting an
    // undefined key become a mystery slice in the composition charts.
    sector: r.sector ?? (cls === "Cash" ? "Cash" : "Unclassified"),
    geo: r.geo ?? (cls === "Cash" ? "United States" : "Unclassified"),
    // Look-through only works for funds we hold constituent weights for.
    etf: ETF_DATA[r.symbol] ? r.symbol : undefined,
    yld: Number(r.yield_pct) || 0,
    isManual: r.is_manual,
  };
}

export async function getDbHoldings(): Promise<DbHolding[]> {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) return [];
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("holdings")
    .select("symbol, name, qty, cost_basis_cents, value_cents, asset_class, sector, geo, yield_pct, is_manual, accounts(name, portfolio, institution)")
    .returns<Row[]>();
  if (error) throw new Error(error.message);
  return (data ?? []).map(mapRow);
}
