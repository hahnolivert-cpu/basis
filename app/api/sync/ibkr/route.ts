import type { NextRequest } from "next/server";
import { jsonNoStore, safeMessage } from "@/lib/http";
import { runIbkrSync } from "@/lib/sync/ibkr";

// IBKR generates statements asynchronously, so this polls and can run past the
// default serverless limit.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET never writes — this is the "show me what it parsed" path.
export async function GET() {
  try {
    return jsonNoStore(await runIbkrSync({ dryRun: true }));
  } catch (e) {
    return jsonNoStore({ target: "ibkr", error: safeMessage(e) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    return jsonNoStore(await runIbkrSync({ dryRun }));
  } catch (e) {
    return jsonNoStore({ target: "ibkr", error: safeMessage(e) }, { status: 502 });
  }
}
