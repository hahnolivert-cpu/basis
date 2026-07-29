// Fills gaps in weekly_snapshots by carrying forward the most recent prior
// week's values, up to the current Sunday.
//
// Usage:
//   node --env-file=.env.local scripts/backfill-missing-weeks.mjs [--dry-run]
//
// These rows are copies, not observations — there is no transaction history to
// reconstruct what was actually held on those dates. They land as source='auto'
// (machine-written rather than imported) and appear as a flat line in the
// charts, which is an honest signal that nothing was measured. Only inserts
// dates that are absent, so re-running is safe and never overwrites a real row.

import { createClient } from "@supabase/supabase-js";

const dryRun = process.argv.includes("--dry-run");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const iso = (d) => d.toISOString().slice(0, 10);

// Most recent Sunday at or before today (UTC).
function currentSunday(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - d.getUTCDay());
  return d;
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { data: rows, error } = await supabase
  .from("weekly_snapshots")
  .select("sunday_date, crypto_cents, equities_cents, cash_cents, total_cents, usd_to_eur, btc_price_usd")
  .order("sunday_date", { ascending: true });

if (error) {
  console.error("Read failed:", error.message);
  process.exit(1);
}
if (!rows?.length) {
  console.error("weekly_snapshots is empty — run the import first.");
  process.exit(1);
}

const existing = new Set(rows.map((r) => r.sunday_date));
const target = currentSunday();

// Walk Sunday by Sunday from the first recorded week to the current one,
// remembering the latest row seen so each gap carries forward its predecessor.
const toInsert = [];
let carry = rows[0];
const byDate = new Map(rows.map((r) => [r.sunday_date, r]));

for (const cursor = new Date(rows[0].sunday_date + "T00:00:00Z"); cursor <= target; cursor.setUTCDate(cursor.getUTCDate() + 7)) {
  const date = iso(cursor);
  if (existing.has(date)) {
    carry = byDate.get(date);
    continue;
  }
  toInsert.push({
    sunday_date: date,
    crypto_cents: carry.crypto_cents,
    equities_cents: carry.equities_cents,
    cash_cents: carry.cash_cents,
    total_cents: carry.total_cents,
    usd_to_eur: Number(carry.usd_to_eur),
    btc_price_usd: Number(carry.btc_price_usd),
    source: "auto",
  });
}

if (!toInsert.length) {
  console.log(`No gaps. ${rows.length} weeks recorded through ${rows.at(-1).sunday_date} (current Sunday ${iso(target)}).`);
  process.exit(0);
}

console.log(`Last recorded week: ${rows.at(-1).sunday_date}`);
console.log(`Current Sunday:     ${iso(target)}`);
console.log(`Filling ${toInsert.length} missing week(s) by carrying values forward:`);
for (const r of toInsert) {
  console.log(`  ${r.sunday_date}  total $${(r.total_cents / 100).toLocaleString()}  (carried)`);
}

if (dryRun) {
  console.log("\n--dry-run: nothing written.");
  process.exit(0);
}

const { error: insertErr } = await supabase.from("weekly_snapshots").insert(toInsert);
if (insertErr) {
  console.error("Insert failed:", insertErr.message);
  process.exit(1);
}

const { count } = await supabase.from("weekly_snapshots").select("*", { count: "exact", head: true });
console.log(`\nInserted ${toInsert.length} row(s). weekly_snapshots now holds ${count} week(s).`);
