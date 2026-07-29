import type { Holding } from "./types";

// Static data — seeded from Kubera + Yahoo screenshots.
// (est.) rows are placeholders sized to match account totals.
// yld = estimated trailing dividend/interest yield.
export const ETF_DATA: Record<string, { sectors: Record<string, number>; geos: Record<string, number> }> = {
  SPHQ: { sectors: { Technology: 0.32, Industrials: 0.21, "Health Care": 0.13, Financials: 0.11, "Consumer Disc.": 0.09, "Comm. Services": 0.08, Other: 0.06 }, geos: { "United States": 1.0 } },
  ILF: { sectors: { Financials: 0.36, Materials: 0.17, Energy: 0.14, "Consumer Staples": 0.13, Industrials: 0.08, Utilities: 0.07, Other: 0.05 }, geos: { Brazil: 0.58, Mexico: 0.26, Chile: 0.08, Peru: 0.05, Colombia: 0.03 } },
  SGOV: { sectors: { "Govt. Bonds": 1.0 }, geos: { "United States": 1.0 } },
  VOO: { sectors: { Technology: 0.33, Financials: 0.13, "Health Care": 0.11, "Consumer Disc.": 0.11, "Comm. Services": 0.09, Industrials: 0.08, Other: 0.15 }, geos: { "United States": 1.0 } },
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

export const DEBTS = 24271;

// Mock net-worth history (monthly closes, $k) — real build derives this
// from daily snapshots of synced balances.
export const NW_HISTORY = (
  [
    ["Jan 25", 742], ["Feb 25", 768], ["Mar 25", 751], ["Apr 25", 803],
    ["May 25", 842], ["Jun 25", 861], ["Jul 25", 894], ["Aug 25", 872],
    ["Sep 25", 918], ["Oct 25", 967], ["Nov 25", 1004], ["Dec 25", 1051],
    ["Jan 26", 1032], ["Feb 26", 1069], ["Mar 26", 1046], ["Apr 26", 1088],
    ["May 26", 1121], ["Jun 26", 1107], ["Jul 26", 1128],
  ] as [string, number][]
).map(([m, v]) => ({ m, v: v * 1000 }));

// Mock monthly allocation weights (%), drifting toward today's mix.
export const DRIFT = NW_HISTORY.map((p, i, arr) => {
  const t = i / (arr.length - 1);
  const lerp = (a: number, b: number) => +(a + (b - a) * t).toFixed(1);
  return { m: p.m, Cash: lerp(46, 37.8), ETFs: lerp(35, 40.6), Stocks: lerp(13, 11.9), Crypto: lerp(6, 9.7) };
});
