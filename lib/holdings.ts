import { createServiceClient } from "./supabase/service";
import { ETF_DATA, SECTOR_BY_SYMBOL, GEO_BY_SYMBOL } from "./data";
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

  // Option contracts trade in units of 100 underlying shares, but a live
  // per-share quote (Yahoo resolves OCC symbols directly) applied through
  // `qty * price` treats qty as shares, not contracts — deflating a real
  // $160 position to ~$1.60. Plaid's institution_value already gives the
  // correct total on every sync, so options skip live repricing entirely,
  // the same way Cash does.
  if (OCC_OPTION.test(symbol.trim().toUpperCase())) return null;

  // "BTC.USD-PAXOS" / "BTC" -> bitcoin
  const base = symbol.split(/[.\-/]/)[0].trim().toUpperCase();
  if (assetClass === "Crypto" || base in CRYPTO_BASES) {
    const id = CRYPTO_BASES[base];
    return id ? { type: "crypto", id } : null;
  }

  return { type: "equity", symbol: symbol.trim().replace(/\s+/g, ".") };
}

// Institution is the unambiguous marker for self-custody rows. `is_manual` is
// not: every seeded estimate carries it too, so filtering on it would sweep in
// provider-account rows and make a symbol like LINK ambiguous across accounts.
export const SELF_CUSTODY_INSTITUTION = "Self-custody";

// `etf` is set only when we hold constituent weights (ETF_DATA). `isEtf` marks
// a fund regardless — without the distinction, an ETF with no weights on file is
// indistinguishable from a single stock, so the exposure chart silently draws it
// as a direct position.
// Heuristic, because no provider gives us a reliable instrument-type flag.
// IBKR truncates descriptions around 28 characters — "ISHARES CORE MSCI EMERGING"
// loses its trailing "ETF" — so matching on the word alone misses real funds.
// Issuer prefixes survive truncation and catch those.
const FUND_ISSUERS =
  /^(ISHARES|VANGUARD|INVESCO|SPDR|SCHWAB|WISDOMTREE|VANECK|PROSHARES|DIREXION|GLOBAL X|FIRST TRUST|FIDELITY|JPMORGAN|DIMENSIONAL|DFA|AMUNDI|XTRACKERS|LYXOR|UBS ETF)\b/i;

export function looksLikeFund(symbol: string, name: string): boolean {
  if (ETF_DATA[symbol]) return true;
  if (/\b(ETF|ETN|FUND|INDEX|TRUST|UCITS)\b/i.test(name)) return true;
  return FUND_ISSUERS.test(name.trim());
}

// OCC option symbols (e.g. "BMNR270115C00065000") are 15-21 chars and blow
// out the ticker column. Render them compactly as "BMNR 01/15 $65C" instead.
const OCC_OPTION = /^([A-Z]{1,6})(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/;

export function formatTicker(symbol: string): string {
  const m = symbol.match(OCC_OPTION);
  if (!m) return symbol;
  const [, underlying, , mm, dd, right, strikeRaw] = m;
  const strike = Number(strikeRaw) / 1000;
  return `${underlying} ${mm}/${dd} $${strike}${right}`;
}

// An option's sector/geo is its underlying company's — "BMNR270115C00065000"
// should classify the same as a direct BMNR position, not sit unclassified
// because the OCC code itself isn't a real ticker.
export function underlyingSymbol(symbol: string): string {
  return symbol.match(OCC_OPTION)?.[1] ?? symbol;
}

// Providers report 0% for every cash balance — none of Brex/IBKR/Plaid's
// sync paths carry an interest rate — so "Est. dividends & interest"
// silently excluded a meaningful chunk of the portfolio. Applied only to
// products specifically designed to pay a sweep/treasury yield; ordinary
// checking (Chase, Robinhood, Brex's own checking) is left alone since it's
// genuinely non-interest-bearing, not a data gap.
//
// Brex Treasury: published base 7-day yield on the DGVXX sweep, effective
// 2026-07-29 — https://www.brex.com/product/cash-management-account/rates-fees.
// Excludes Brex's balance-based bonus (0–0.35% on top) since eligibility
// isn't visible to us; better to understate than assume a tier we can't see.
const CASH_APY_ESTIMATE: Record<string, number> = {
  Treasury: 3.35,
};

// IBKR pays credit interest only on USD cash above the first $10k, at 4.33%
// for a Pro account with NAV > $100k (this one clears that easily) —
// https://www.interactivebrokers.com/en/accounts/fees/pricing-interest-rates.php.
// A flat rate on the whole balance would overstate a below-tier account, so
// this is computed from the actual balance rather than hardcoded.
function ibkrCashYield(balanceCents: number): number {
  const balance = balanceCents / 100;
  if (balance <= 10000) return 0;
  return +((4.33 * (balance - 10000)) / balance).toFixed(2);
}

export type DbHolding = Holding & {
  isManual: boolean;
  dbSymbol: string;
  institution: string;
  isEtf: boolean;
  hasLookThrough: boolean;
};

// Different share class, identical index — VFIAX is the mutual-fund Admiral
// share class of the same underlying fund VOO's ETF share class tracks, so
// it can reuse VOO's look-through weights rather than sitting opaque.
const FUND_ALIASES: Record<string, string> = { VFIAX: "VOO" };

function mapRow(r: Row): DbHolding {
  const cls = (["Cash", "Equities", "Crypto"].includes(r.asset_class) ? r.asset_class : "Equities") as AssetClass;
  const etfKey = FUND_ALIASES[r.symbol] ?? r.symbol;
  // An option's classification comes from its underlying, not its OCC code.
  const classKey = underlyingSymbol(r.symbol);
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
    // Providers don't supply sector/geo. Fall back to the static per-symbol
    // table before giving up and labeling it Unclassified. Crypto synced via
    // Plaid/IBKR carries no geo at all (only the self-custody manual entries
    // set one) — every crypto asset is borderless, so that's always "Global"
    // rather than a per-symbol guess.
    sector: r.sector ?? (cls === "Cash" ? "Cash" : SECTOR_BY_SYMBOL[classKey] ?? "Unclassified"),
    geo: r.geo ?? (cls === "Cash" ? "United States" : cls === "Crypto" ? "Global" : GEO_BY_SYMBOL[classKey] ?? "Unclassified"),
    // Look-through only works for funds we hold constituent weights for.
    etf: ETF_DATA[etfKey] ? etfKey : undefined,
    yld: Number(r.yield_pct) || (r.symbol === "IBKR Cash" ? ibkrCashYield(r.value_cents) : CASH_APY_ESTIMATE[r.symbol]) || 0,
    isManual: r.is_manual,
    institution: r.accounts?.institution ?? "Unknown",
    isEtf: looksLikeFund(r.symbol, r.name),
    hasLookThrough: Boolean(ETF_DATA[etfKey]),
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
