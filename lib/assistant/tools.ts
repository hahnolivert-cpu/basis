import type Anthropic from "@anthropic-ai/sdk";
import { createServiceClient } from "@/lib/supabase/service";
import { safeMessage } from "@/lib/http";

// Lets the assistant go beyond the static snapshot in context.ts and answer
// anything the schema can express (e.g. "what did I spend at Target last
// quarter"). Executes through the `execute_readonly_query` Postgres function
// (see supabase/migrations/20260803190000_assistant_readonly_query.sql),
// which is owned by a role granted SELECT on just the tables below — notably
// not `plaid_items` (live bank access tokens) — and forces the transaction
// read-only before running the model-supplied SQL, so a prompt-injected or
// hallucinated write is rejected by Postgres itself, not by pattern-matching
// the query text.
const SCHEMA = `- accounts(id, institution, name, portfolio['capital'|'personal'], type['cash'|'brokerage'|'crypto'], created_at)
- holdings(id, account_id, symbol, name, qty, cost_basis_cents, value_cents, asset_class['Cash'|'Equities'|'Crypto'|'Angel Investment'], sector, geo, yield_pct, is_manual, included_in_net_worth, updated_at)
- snapshots(id, date, account_id, value_cents, eurusd_rate, btcusd_rate) — daily per-account value history
- transactions(id, account_id, date, type['buy'|'sell'|'dividend'|'interest'|'withholding_tax'|'transfer'], symbol, amount_cents, qty, price_cents, description, external_id)
- liabilities(id, name, amount_cents, updated_at)
- dividend_cache(symbol, yield_pct, updated_at) — today's trailing-yield figure per symbol
- dividend_schedule_cache(symbol, ex_dividend_date, cash_amount, frequency, updated_at) — individual dividend payments, including declared-but-not-yet-paid ones
- earnings_cache(symbol, next_date, next_eps_estimate, next_revenue_estimate, history jsonb, updated_at)
- weekly_snapshots(sunday_date, crypto_cents, equities_cents, cash_cents, total_cents, usd_to_eur, btc_price_usd, source['import'|'auto'], created_at) — weekly net worth history
- card_spend(id, source, card_last4, transaction_date, posted_date, description, category, amount_cents, reimbursed_by, external_id, created_at) — personal + Brex card spending; amount_cents positive = purchase, negative = refund; reimbursed_by='976' means it counts toward 976 Capital, not personal, spending
- assistant_realized_gains(id, account_id, institution, account_name, portfolio, symbol, sell_date, qty_sold, proceeds_cents, avg_cost_cents_per_unit, realized_gain_cents) — a VIEW, one row per real sell transaction, already lot-matched (average cost method) and with currency-pair noise (IBKR logs FX conversions like EUR.USD as type='sell' too) filtered out. Use this instead of computing realized gains yourself from transactions — matching each sell against its buys correctly needs this join, which is exactly what the view already does. realized_gain_cents is NULL, not 0, when a sell has no buy history to match against (e.g. a position predating this app's transaction history) — report that as "unknown cost basis," don't treat it as zero gain.

All money columns are integer cents (divide by 100 for dollars). accounts.id joins holdings/snapshots/transactions.account_id.`;

export const queryDatabaseTool: Anthropic.Tool = {
  name: "query_database",
  description: `Run a read-only SQL SELECT query against Oliver's financial database to answer anything the pre-loaded snapshot doesn't cover — a specific date range, a merchant, a symbol not in the snapshot, an aggregate the snapshot didn't compute, etc. Only SELECT is permitted; any write is rejected before it can run. Results are capped at 500 rows, so aggregate (SUM/COUNT/GROUP BY) rather than pulling raw rows when you just need a total. Schema:\n${SCHEMA}`,
  input_schema: {
    type: "object",
    properties: {
      sql: { type: "string", description: "A single Postgres SELECT statement." },
    },
    required: ["sql"],
  },
};

const MAX_RESULT_CHARS = 8000;

export async function runDatabaseQuery(sql: string): Promise<string> {
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase.rpc("execute_readonly_query", { query_text: sql });
    if (error) return `Query failed: ${error.message}`;
    const json = JSON.stringify(data);
    if (json.length > MAX_RESULT_CHARS) {
      return `${json.slice(0, MAX_RESULT_CHARS)}\n\n[truncated — ${json.length} chars total; narrow the query with more filters or aggregation]`;
    }
    return json;
  } catch (e) {
    return `Query failed: ${safeMessage(e)}`;
  }
}
