// One-time deep pull of Brex card transaction history into card_spend —
// the regular sync (lib/sync/brex.ts, run via the dashboard "Sync now"
// button or the weekly cron) only fetches a rolling window of the most
// recent 500 charges, which is plenty to stay current but won't backfill
// everything on its own. Idempotent (upserts on external_id), safe to
// re-run.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/backfill-brex-spend.ts

import { createClient } from "@supabase/supabase-js";
import { fetchBrexCardTransactions } from "../lib/brex";
import { mccToCategory } from "../lib/spending";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
const token = process.env.BREX_API_TOKEN;
if (!url || !key || !token) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or BREX_API_TOKEN.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  console.log("Fetching full Brex card transaction history…");
  const txns = await fetchBrexCardTransactions(token as string, { pages: 200 });
  console.log(`Fetched ${txns.length} transactions.`);

  const rows = txns.map((t) => ({
    source: "brex",
    card_last4: "Brex",
    transaction_date: t.date,
    posted_date: t.date,
    description: t.description,
    category: mccToCategory(t.mcc),
    amount_cents: t.amountCents,
    reimbursed_by: "976",
    external_id: t.externalId,
  }));

  // Chunked — a single upsert of thousands of rows risks the request size
  // limit that tripped up other bulk writes in this codebase.
  const CHUNK = 500;
  let upserted = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    const { error, count } = await supabase.from("card_spend").upsert(chunk, { onConflict: "external_id", count: "exact" });
    if (error) throw new Error(error.message);
    upserted += count ?? chunk.length;
  }
  console.log(`Upserted ${upserted} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
