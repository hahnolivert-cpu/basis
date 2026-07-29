// Seeds weekly_snapshots from a spreadsheet CSV export (source='import').
//
// Usage:
//   node --env-file=.env.local scripts/import-weekly-snapshots.mjs [path-to-csv]
//
// Defaults to ~/Downloads/networth-history.csv. Idempotent — upserts on
// sunday_date, so re-running refreshes rather than duplicating. Only touches
// source='import' rows; cron-written source='auto' rows are left alone unless
// the CSV happens to cover the same Sunday.

import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { createClient } from "@supabase/supabase-js";

const csvPath = process.argv[2] ?? join(homedir(), "Downloads", "networth-history.csv");

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  console.error("Run with: node --env-file=.env.local scripts/import-weekly-snapshots.mjs");
  process.exit(1);
}

// Dollars (possibly fractional) -> integer cents.
const cents = (v) => Math.round(Number(v) * 100);

const text = readFileSync(csvPath, "utf8").trim();
const [headerLine, ...dataLines] = text.split("\n");
const header = headerLine.split(",").map((h) => h.trim());

const required = ["date", "crypto_usd", "equities_usd", "cash_usd", "total_usd", "usd_to_eur", "btc_price_usd"];
const missing = required.filter((c) => !header.includes(c));
if (missing.length) {
  console.error(`CSV is missing required column(s): ${missing.join(", ")}`);
  process.exit(1);
}

const rows = [];
const problems = [];

dataLines.forEach((line, i) => {
  const lineNo = i + 2; // 1-based, +1 for header
  const rec = Object.fromEntries(line.split(",").map((v, j) => [header[j], v?.trim()]));

  if (!/^\d{4}-\d{2}-\d{2}$/.test(rec.date)) {
    problems.push(`line ${lineNo}: bad date "${rec.date}"`);
    return;
  }
  if (new Date(rec.date + "T00:00:00Z").getUTCDay() !== 0) {
    problems.push(`line ${lineNo}: ${rec.date} is not a Sunday`);
    return;
  }
  const nums = required.slice(1).map((c) => Number(rec[c]));
  if (nums.some((n) => !Number.isFinite(n))) {
    problems.push(`line ${lineNo}: non-numeric value in ${rec.date}`);
    return;
  }

  rows.push({
    sunday_date: rec.date,
    crypto_cents: cents(rec.crypto_usd),
    equities_cents: cents(rec.equities_usd),
    cash_cents: cents(rec.cash_usd),
    total_cents: cents(rec.total_usd),
    usd_to_eur: Number(rec.usd_to_eur),
    btc_price_usd: Number(rec.btc_price_usd),
    source: "import",
  });
});

if (problems.length) {
  console.error(`Refusing to import — ${problems.length} malformed row(s):`);
  problems.forEach((p) => console.error("  " + p));
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

const { error } = await supabase.from("weekly_snapshots").upsert(rows, { onConflict: "sunday_date" });
if (error) {
  console.error("Upsert failed:", error.message);
  process.exit(1);
}

const { count, error: countErr } = await supabase
  .from("weekly_snapshots")
  .select("*", { count: "exact", head: true })
  .eq("source", "import");
if (countErr) {
  console.error("Verification query failed:", countErr.message);
  process.exit(1);
}

console.log(`Parsed ${rows.length} rows from ${csvPath}`);
console.log(`Range: ${rows[0].sunday_date} -> ${rows.at(-1).sunday_date}`);
console.log(`weekly_snapshots now holds ${count} source='import' row(s).`);
