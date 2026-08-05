import { jsonNoStore } from "@/lib/http";
import { getEarnings } from "@/lib/earnings";

// Next earnings date + analyst estimates, and actual-vs-estimate results for
// the last several quarters, for individual companies held (funds/ETFs
// excluded — they don't have an earnings call to report on). Finnhub's free
// tier has no earnings-call transcript access, so this is the reported
// numbers (EPS/revenue actual vs estimate, surprise %), not a summary of
// what was said on the call.
//
// Actual fetch/cache logic lives in lib/earnings.ts, shared with
// app/api/cron/earnings — that cron keeps the cache warm on a schedule so a
// page load here is normally just a cache read, not the thing that kicks
// off the slow per-symbol backfill.
export const dynamic = "force-dynamic";

export type { EarningsQuarter, SymbolEarnings, EarningsPayload } from "@/lib/earnings";

// Small batch — a page load shouldn't burn through the whole per-minute
// rate-limit budget on its own; app/api/cron/earnings does the heavy lifting.
const CLIENT_BATCH_SIZE = 2;

export async function GET() {
  const { payload } = await getEarnings(CLIENT_BATCH_SIZE);
  return jsonNoStore(payload);
}
