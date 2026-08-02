// Imports a bank CSV export directly via the service-role client, bypassing
// the session-gated /api/spending/import route — same reasoning as the cron
// scripts (see CLAUDE.md): a script has no session cookie, so calling the
// HTTP route would just 401. Shares the same parser the route uses, so this
// stays byte-for-byte identical to what an in-app upload would do.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/import-card-spend.ts <path-to-csv> [more.csv ...]

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { parseCapitalOneCsv } from "../lib/spending";

const paths = process.argv.slice(2);
if (paths.length === 0) {
  console.error("Usage: npx tsx --env-file=.env.local scripts/import-card-spend.ts <path-to-csv> [more.csv ...]");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  for (const path of paths) {
    const csv = readFileSync(path, "utf8");
    const parsed = parseCapitalOneCsv(csv);
    if (parsed.length === 0) {
      console.log(`${path}: 0 rows to import`);
      continue;
    }
    const rows = parsed.map((r) => ({
      source: r.source,
      card_last4: r.cardLast4,
      transaction_date: r.transactionDate,
      posted_date: r.postedDate,
      description: r.description,
      category: r.category,
      amount_cents: r.amountCents,
      external_id: r.externalId,
    }));
    const { error, count } = await supabase
      .from("card_spend")
      .upsert(rows, { onConflict: "external_id", ignoreDuplicates: false, count: "exact" });
    if (error) throw new Error(`${path}: ${error.message}`);
    console.log(`${path}: upserted ${count ?? rows.length} of ${rows.length} parsed rows`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
