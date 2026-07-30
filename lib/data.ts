import type { Holding } from "./types";

// Static data — seeded from Kubera + Yahoo screenshots.
// (est.) rows are placeholders sized to match account totals.
// yld = estimated trailing dividend/interest yield.
// `top` keys are tickers, not names — TrueExposureCard buckets exposure by
// ticker so a stock held directly and the same stock held inside an ETF land
// in the same bar. Keying by company name instead let them silently diverge
// (a direct MSFT position and "Microsoft" via VOO/SPHQ never merged).
export const ETF_DATA: Record<string, { sectors: Record<string, number>; geos: Record<string, number>; top: [string, number][] }> = {
  SPHQ: {
    sectors: { Technology: 0.32, Industrials: 0.21, "Health Care": 0.13, Financials: 0.11, "Consumer Disc.": 0.09, "Comm. Services": 0.08, Other: 0.06 }, geos: { "United States": 1.0 },
    top: [["AAPL", 0.058], ["MSFT", 0.056], ["NVDA", 0.055], ["AVGO", 0.044], ["LLY", 0.031], ["MA", 0.03], ["V", 0.029], ["GOOGL", 0.026], ["XOM", 0.024], ["JNJ", 0.023]],
  },
  ILF: {
    sectors: { Financials: 0.36, Materials: 0.17, Energy: 0.14, "Consumer Staples": 0.13, Industrials: 0.08, Utilities: 0.07, Other: 0.05 }, geos: { Brazil: 0.58, Mexico: 0.26, Chile: 0.08, Peru: 0.05, Colombia: 0.03 },
    top: [["ITUB", 0.098], ["VALE", 0.086], ["NU", 0.079], ["PBR", 0.072], ["AMX", 0.062], ["GMEXICOB", 0.045], ["FMX", 0.044], ["GFNORTEO", 0.041], ["BAP", 0.038], ["B3SA3", 0.033]],
  },
  SGOV: {
    sectors: { "Govt. Bonds": 1.0 }, geos: { "United States": 1.0 },
    top: [["USTBILL", 1.0]],
  },
  VOO: {
    sectors: { Technology: 0.33, Financials: 0.13, "Health Care": 0.11, "Consumer Disc.": 0.11, "Comm. Services": 0.09, Industrials: 0.08, Other: 0.15 }, geos: { "United States": 1.0 },
    top: [["NVDA", 0.075], ["MSFT", 0.068], ["AAPL", 0.06], ["AMZN", 0.041], ["GOOGL", 0.04], ["META", 0.029], ["AVGO", 0.024], ["TSLA", 0.019], ["BRK.B", 0.016], ["JPM", 0.014]],
  },
  // Estimated compositions (same convention as the four funds above) added to
  // cover funds that previously had no look-through data at all — BIDD/IEMG/
  // URTH/VGK were falling into "Unclassified" sector and missing Europe/Asia
  // geography entirely, since a provider-labeled sector/geo never comes back
  // for them and there was nothing here to fall back on.
  VGK: {
    sectors: { Financials: 0.2, "Health Care": 0.14, Industrials: 0.14, "Consumer Staples": 0.1, Technology: 0.08, "Consumer Disc.": 0.08, Materials: 0.07, Energy: 0.06, "Comm. Services": 0.05, Other: 0.08 },
    geos: { Europe: 1.0 },
    top: [["ASML", 0.036], ["NVO", 0.028], ["SAP", 0.024], ["NSRGY", 0.022], ["AZN", 0.019], ["SHEL", 0.018], ["LVMUY", 0.016], ["RHHBY", 0.015], ["NVS", 0.014], ["HSBC", 0.013]],
  },
  IEMG: {
    sectors: { Technology: 0.23, Financials: 0.2, "Consumer Disc.": 0.12, "Comm. Services": 0.08, Materials: 0.07, Industrials: 0.06, Energy: 0.05, "Consumer Staples": 0.05, "Health Care": 0.04, Other: 0.1 },
    geos: { Asia: 0.84, Brazil: 0.06, Other: 0.1 },
    top: [["TSM", 0.09], ["TCEHY", 0.045], ["BABA", 0.03], ["SSNLF", 0.025], ["HDB", 0.014], ["INFY", 0.012], ["IBN", 0.011], ["PDD", 0.01]],
  },
  URTH: {
    sectors: { Technology: 0.24, Financials: 0.15, "Health Care": 0.1, "Consumer Disc.": 0.1, Industrials: 0.1, "Comm. Services": 0.08, "Consumer Staples": 0.06, Energy: 0.04, Other: 0.13 },
    geos: { "United States": 0.68, Europe: 0.2, Asia: 0.08, Other: 0.04 },
    top: [["NVDA", 0.045], ["MSFT", 0.038], ["AAPL", 0.034], ["AMZN", 0.024], ["META", 0.015], ["GOOGL", 0.014], ["AVGO", 0.013], ["TSLA", 0.01], ["NVO", 0.007], ["ASML", 0.006]],
  },
  BIDD: {
    sectors: { Financials: 0.26, Energy: 0.12, Materials: 0.1, Industrials: 0.1, Utilities: 0.09, "Consumer Staples": 0.08, "Health Care": 0.08, "Comm. Services": 0.06, Other: 0.11 },
    geos: { Europe: 0.55, Asia: 0.35, Other: 0.1 },
    top: [["HSBC", 0.04], ["RIO", 0.035], ["SHEL", 0.03], ["BHP", 0.028], ["TTE", 0.024], ["VOD", 0.02], ["MUFG", 0.018], ["TM", 0.016], ["SAN", 0.015], ["NABZY", 0.012]],
  },
};

// Continents for the "Geography — true exposure" chart, which groups by
// continent rather than raw country so the composition chart doesn't
// fragment into one sliver per country. Falls back to the raw geo string
// when a value isn't listed, so nothing silently disappears.
export const CONTINENT_BY_GEO: Record<string, string> = {
  "United States": "North America",
  Mexico: "North America",
  Brazil: "South America",
  Chile: "South America",
  Peru: "South America",
  Colombia: "South America",
  Global: "Crypto / Global",
};

// Per-symbol sector/geo, applied only when a provider didn't supply its own
// (mapRow does `r.sector ?? SECTOR_BY_SYMBOL[...]`) — this never overrides
// real provider data, it just replaces "Unclassified" with a real answer for
// symbols we can identify with reasonable confidence. Options resolve to
// their underlying first (see underlyingSymbol in lib/holdings.ts), so an
// entry here for e.g. BMNR also classifies a BMNR call option.
//
// Deliberately incomplete: a thinly-traded/unfamiliar ticker (e.g. the GLNK
// option underlying held this session) is left out rather than guessed at —
// "Unclassified" is honest, a wrong sector isn't.
export const SECTOR_BY_SYMBOL: Record<string, string> = {
  AMZN: "Consumer Disc.",
  GOOGL: "Comm. Services",
  MSFT: "Technology",
  NOW: "Technology",
  MSTR: "Technology",
  STRC: "Technology",
  QBTS: "Technology",
  BMNR: "Technology",
  TTD: "Comm. Services",
  "BRK.B": "Financials",
  "BRK B": "Financials",
  HOOD: "Financials",
  COIN: "Financials",
  V: "Financials",
  PURR: "Financials",
  NVO: "Health Care",
  MCD: "Consumer Disc.",
  MELI: "Consumer Disc.",
  PG: "Consumer Staples",
};

export const GEO_BY_SYMBOL: Record<string, string> = {
  AMZN: "United States",
  GOOGL: "United States",
  MSFT: "United States",
  NOW: "United States",
  MSTR: "United States",
  STRC: "United States",
  QBTS: "United States",
  BMNR: "United States",
  TTD: "United States",
  "BRK.B": "United States",
  "BRK B": "United States",
  HOOD: "United States",
  COIN: "United States",
  V: "United States",
  PURR: "United States",
  MCD: "United States",
  PG: "United States",
  NVO: "Europe",
  MELI: "South America",
};

// qty = share/coin count implied by screenshot values; live sync (future) reprices qty x price.
export const BASE_HOLDINGS: Holding[] = [
  // ---- 976 Capital · Cash (Brex) ----
  { sym: "Brex Checking", name: "Primary checking ··1593", pf: "capital", acct: "Brex", cls: "Cash", value: 3057, cost: 3057, day: 0, sector: "Cash", geo: "United States", yld: 0 },
  { sym: "Brex Treasury", name: "Treasury ··5461", pf: "capital", acct: "Brex", cls: "Cash", value: 370714, cost: 370714, day: 0.01, sector: "Cash", geo: "United States", yld: 4.3 },
  // ---- 976 Capital · IBKR ----
  { sym: "MSTR", qty: 13.7, name: "Strategy Inc", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 2809.63, cost: 7701.93, day: -2.31, sector: "Technology", geo: "United States", yld: 0 },
  { sym: "SPHQ", qty: 266.57, name: "Invesco S&P 500 Quality ETF", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 19192.87, cost: 16504.98, day: -0.68, etf: "SPHQ", yld: 1.3 },
  { sym: "GOOGL", qty: 76.88, name: "Alphabet Inc.", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 15069.18, cost: 14122.32, day: 2.5, sector: "Comm. Services", geo: "United States", yld: 0.45 },
  { sym: "ILF", qty: 317.14, name: "iShares Latin America 40 ETF", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 9197.15, cost: 9209.11, day: 0.27, etf: "ILF", yld: 5.6 },
  { sym: "TTD", qty: 66.91, name: "The Trade Desk, Inc.", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 5085.45, cost: 6380.55, day: 5.34, sector: "Technology", geo: "United States", yld: 0 },
  { sym: "SGOV", qty: 1542.29, name: "iShares 0-3 Mo Treasury ETF (est.)", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 155000, cost: 154200, day: 0.01, etf: "SGOV", yld: 4.7 },
  { sym: "NVDA", qty: 200, name: "NVIDIA Corp (est.)", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 36400, cost: 21000, day: 1.2, sector: "Technology", geo: "United States", yld: 0.03 },
  { sym: "AMZN", qty: 125.21, name: "Amazon.com (est.)", pf: "capital", acct: "IBKR ··6994", cls: "Equities", value: 29300, cost: 24800, day: 0.8, sector: "Consumer Disc.", geo: "United States", yld: 0 },
  // ---- 976 Capital · Crypto (Paxos) ----
  { sym: "BTC", qty: 0.1365, name: "Bitcoin · 0.1365", pf: "capital", acct: "Paxos", cls: "Crypto", value: 8711, cost: 6100, day: -1.9, sector: "Crypto", geo: "Global", yld: 0 },
  { sym: "ETH", qty: 3.1152, name: "Ethereum · 3.1152", pf: "capital", acct: "Paxos", cls: "Crypto", value: 5960, cost: 7400, day: -2.4, sector: "Crypto", geo: "Global", yld: 0 },
  { sym: "SOL", qty: 21.0405, name: "Solana · 21.04", pf: "capital", acct: "Paxos", cls: "Crypto", value: 1564, cost: 1900, day: -3.2, sector: "Crypto", geo: "Global", yld: 0 },
  // ---- Personal ----
  { sym: "Chase Checking", name: "Total checking ··4410 (est.)", pf: "personal", acct: "Chase", cls: "Cash", value: 61719, cost: 61719, day: 0, sector: "Cash", geo: "United States", yld: 0 },
  { sym: "VOO", qty: 500, name: "Vanguard S&P 500 ETF (est.)", pf: "personal", acct: "Robinhood", cls: "Equities", value: 285000, cost: 228000, day: 0.4, etf: "VOO", yld: 1.25 },
  { sym: "AAPL", qty: 176.19, name: "Apple Inc (est.)", pf: "personal", acct: "Robinhood", cls: "Equities", value: 37000, cost: 22000, day: -0.3, sector: "Technology", geo: "United States", yld: 0.4 },
  { sym: "GOOGL", qty: 76.53, name: "Alphabet Inc. (est.)", pf: "personal", acct: "Robinhood", cls: "Equities", value: 15000, cost: 12000, day: 2.5, sector: "Comm. Services", geo: "United States", yld: 0.45 },
  { sym: "LINK", qty: 4209.17, name: "Chainlink · USD", pf: "personal", acct: "Robinhood", cls: "Crypto", value: 67346.66, cost: 101728.45, day: -3.09, sector: "Crypto", geo: "Global", yld: 0 },
  { sym: "HYPE", qty: 561.34, name: "Hyperliquid · USD", pf: "personal", acct: "Robinhood", cls: "Crypto", value: 23576.44, cost: 18184.95, day: -3.51, sector: "Crypto", geo: "Global", yld: 0 },
];

// Debts now live in the liabilities table so they can be maintained; see
// app/api/liabilities and supabase/migrations/*_liabilities.sql.

// Historical EURUSD and BTCUSD closes now live in the weekly_snapshots table
// (usd_to_eur / btc_price_usd), seeded from the spreadsheet export — see
// scripts/import-weekly-snapshots.mjs. CurrencyLensCard reads them through
// useWeeklySnapshots rather than mock arrays.
