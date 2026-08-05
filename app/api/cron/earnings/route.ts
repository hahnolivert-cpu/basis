import { NextResponse, type NextRequest } from "next/server";
import { getEarnings } from "@/lib/earnings";

// Warms the earnings cache on a schedule (vercel.json) instead of leaving it
// to whoever happens to load the Earnings tab first each day — that was the
// actual complaint this exists to fix: a cold cache only backfills 2 stale
// symbols per page-triggered request (app/api/earnings), so fully warming
// ~15 symbols took several minutes of an open tab polling every 60s. Not
// covered by the auth middleware (see middleware.ts) — authenticates on
// CRON_SECRET instead, same as the other cron routes.
//
// One invocation loops multiple batches rather than relying on multiple
// scheduled firings, since Polygon's ~5 req/min free-tier limit (the
// binding constraint — see lib/earnings.ts) needs real spacing between
// batches, and looping in-process keeps that pacing self-contained instead
// of split across vercel.json cron entries. Stops early once a batch
// refreshes nothing (cache already fully warm), so a steady-state day exits
// in one round trip rather than always spending the full budget.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BATCH_SIZE = 4;
const MAX_ROUNDS = 4;
const PACE_MS = 12_000;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  const allErrors: string[] = [];
  let totalRefreshed = 0;
  let roundsRun = 0;
  for (let i = 0; i < MAX_ROUNDS; i++) {
    const { payload, refreshedCount } = await getEarnings(BATCH_SIZE);
    roundsRun++;
    if (payload.errors) allErrors.push(...payload.errors);
    totalRefreshed += refreshedCount;
    if (refreshedCount === 0) break;
    if (i < MAX_ROUNDS - 1) await sleep(PACE_MS);
  }

  return NextResponse.json({ ok: true, totalRefreshed, rounds: roundsRun, errors: allErrors });
}
