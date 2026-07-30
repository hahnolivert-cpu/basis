import type { Holding } from "./types";
import type { WeeklySnapshot } from "./types";
import type { Liability } from "@/app/api/liabilities/route";
import { toRows } from "./weekly";

// Entirely fictional portfolio for the public /demo route — no real account,
// balance, or provider is represented here. Numbers are deterministic (no
// Math.random()) so the demo looks identical on every load and can't drift
// into an inconsistent state between server and client render.

export const DEMO_HOLDINGS: Holding[] = [
  // ---- Capital · Cash ----
  { sym: "Checking", name: "Business checking", pf: "capital", acct: "Demo Bank", cls: "Cash", value: 18420, cost: 18420, day: 0, sector: "Cash", geo: "United States", yld: 0 },
  { sym: "Treasury", name: "Treasury sweep", pf: "capital", acct: "Demo Bank", cls: "Cash", value: 142600, cost: 142600, day: 0.01, sector: "Cash", geo: "United States", yld: 3.9 },
  // ---- Capital · Equities/ETFs ----
  { sym: "VOO", qty: 210, name: "Vanguard S&P 500 ETF", pf: "capital", acct: "Demo Brokerage", cls: "Equities", value: 118650, cost: 96000, day: 0.42, etf: "VOO", yld: 1.2 },
  { sym: "AAPL", qty: 320, name: "Apple Inc", pf: "capital", acct: "Demo Brokerage", cls: "Equities", value: 74240, cost: 51200, day: -0.31, sector: "Technology", geo: "United States", yld: 0.4 },
  { sym: "MSFT", qty: 140, name: "Microsoft Corp", pf: "capital", acct: "Demo Brokerage", cls: "Equities", value: 68950, cost: 54600, day: 0.55, sector: "Technology", geo: "United States", yld: 1.1 },
  { sym: "JPM", qty: 260, name: "JPMorgan Chase", pf: "capital", acct: "Demo Brokerage", cls: "Equities", value: 58370, cost: 46800, day: -0.12, sector: "Financials", geo: "United States", yld: 2.3 },
  { sym: "VGK", qty: 480, name: "Vanguard FTSE Europe ETF", pf: "capital", acct: "Demo Brokerage", cls: "Equities", value: 32160, cost: 29900, day: 0.18, etf: "VGK", yld: 2.9 },
  // ---- Capital · Crypto ----
  { sym: "BTC", qty: 1.35, name: "Bitcoin", pf: "capital", acct: "Demo Exchange", cls: "Crypto", value: 86400, cost: 61000, day: 1.8, sector: "Crypto", geo: "Global", yld: 0 },
  // ---- Personal · Cash ----
  { sym: "Checking", name: "Personal checking", pf: "personal", acct: "Demo Bank", cls: "Cash", value: 9840, cost: 9840, day: 0, sector: "Cash", geo: "United States", yld: 0 },
  // ---- Personal · Equities ----
  { sym: "GOOGL", qty: 95, name: "Alphabet Inc", pf: "personal", acct: "Demo Brokerage", cls: "Equities", value: 16150, cost: 12800, day: 0.64, sector: "Comm. Services", geo: "United States", yld: 0.3 },
  { sym: "AMZN", qty: 110, name: "Amazon.com Inc", pf: "personal", acct: "Demo Brokerage", cls: "Equities", value: 24420, cost: 18700, day: -0.28, sector: "Consumer Disc.", geo: "United States", yld: 0 },
  { sym: "COST", qty: 40, name: "Costco Wholesale", pf: "personal", acct: "Demo Brokerage", cls: "Equities", value: 37600, cost: 29200, day: 0.21, sector: "Consumer Staples", geo: "United States", yld: 0.6 },
  // ---- Personal · Crypto ----
  { sym: "ETH", qty: 12.4, name: "Ethereum", pf: "personal", acct: "Demo Wallet", cls: "Crypto", value: 28150, cost: 33400, day: -1.6, sector: "Crypto", geo: "Global", yld: 0 },
  { sym: "SOL", qty: 145, name: "Solana", pf: "personal", acct: "Demo Wallet", cls: "Crypto", value: 12680, cost: 9700, day: 2.4, sector: "Crypto", geo: "Global", yld: 0 },
  // ---- Personal · 401k ----
  { sym: "VFIAX", qty: 62, name: "Vanguard 500 Index Admiral · 401k", pf: "personal", acct: "Demo 401k", cls: "Equities", value: 41850, cost: 33500, day: 0.42, etf: "VOO", yld: 1.2 },
];

export const DEMO_LIABILITIES: Liability[] = [
  { id: "demo-card-1", name: "Demo Rewards Card ··4471", amount_cents: 286400 },
  { id: "demo-card-2", name: "Demo Card ··9012", amount_cents: 74300 },
];
export const DEMO_DEBTS_CENTS = DEMO_LIABILITIES.reduce((s, l) => s + l.amount_cents, 0);

const WEEK_COUNT = 34;
const START_DATE = new Date("2025-11-30T00:00:00Z");

function demoSnapshot(i: number, total: number): WeeklySnapshot {
  const d = new Date(START_DATE);
  d.setUTCDate(d.getUTCDate() + i * 7);
  const cryptoCents = Math.round(total * 0.18 * 100);
  const equitiesCents = Math.round(total * 0.62 * 100);
  const cashCents = Math.round(total * 100) - cryptoCents - equitiesCents;
  return {
    sunday_date: d.toISOString().slice(0, 10),
    crypto_cents: cryptoCents,
    equities_cents: equitiesCents,
    cash_cents: cashCents,
    total_cents: Math.round(total * 100),
    usd_to_eur: 0.86,
    btc_price_usd: 58000 + i * 320,
    source: i < WEEK_COUNT - 8 ? "import" : "auto",
  };
}

// Gentle uptrend with a two-frequency wave for visual texture — deterministic
// on purpose, not Math.random(), so the demo reads the same every time.
export const DEMO_SNAPSHOTS: WeeklySnapshot[] = Array.from({ length: WEEK_COUNT }, (_, i) => {
  const t = i / (WEEK_COUNT - 1);
  const trend = 480_000 + t * 260_000;
  const wave = Math.sin(i / 2.3) * 16_000 + Math.sin(i / 5.1) * 8_000;
  return demoSnapshot(i, Math.round(trend + wave));
});

export const DEMO_WEEKLY_ROWS = toRows(DEMO_SNAPSHOTS);
