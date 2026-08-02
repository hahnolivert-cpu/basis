// One-time re-categorization of rows already in card_spend after refining
// the category rules (lib/spending.ts refineCategory) — e.g. splitting
// "Insurance" into Health Insurance / Other Insurance and pulling Google /
// Claude out of the generic "Software" bucket. New rows get the refined
// category at write time (lib/sync/brex.ts, app/api/spending/import); this
// just backfills what's already stored. Safe to re-run — only rows whose
// computed category differs from what's stored get updated.
//
// Usage:
//   npx tsx --env-file=.env.local scripts/recategorize-spend.ts

import { createClient } from "@supabase/supabase-js";
import { refineCategory } from "../lib/spending";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function fetchAll() {
  // Supabase caps a single select at 1000 rows — page through with .range()
  // rather than assuming everything fits in one response.
  const PAGE = 1000;
  const all: { id: string; description: string; category: string }[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("card_spend")
      .select("id, description, category")
      .range(from, from + PAGE - 1);
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < PAGE) break;
  }
  return all;
}

async function main() {
  const data = await fetchAll();

  const changes = (data ?? [])
    .map((r) => ({ id: r.id, from: r.category, to: refineCategory(r.description, r.category) }))
    .filter((r) => r.from !== r.to);

  console.log(`${data?.length ?? 0} rows checked, ${changes.length} need recategorizing.`);
  const byChange = new Map<string, number>();
  for (const c of changes) {
    const key = `${c.from} -> ${c.to}`;
    byChange.set(key, (byChange.get(key) ?? 0) + 1);
  }
  for (const [k, n] of Array.from(byChange)) console.log(`  ${n}x  ${k}`);

  for (const c of changes) {
    const { error: updateErr } = await supabase.from("card_spend").update({ category: c.to }).eq("id", c.id);
    if (updateErr) throw new Error(`${c.id}: ${updateErr.message}`);
  }
  console.log(`Updated ${changes.length} rows.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
