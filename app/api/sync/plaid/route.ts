import type { NextRequest } from "next/server";
import { jsonNoStore, safeMessage } from "@/lib/http";
import { runPlaidSync } from "@/lib/sync/plaid";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET never writes — the "show me what it parsed" path.
export async function GET() {
  try {
    return jsonNoStore(await runPlaidSync({ dryRun: true }));
  } catch (e) {
    return jsonNoStore({ target: "plaid", error: safeMessage(e) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    return jsonNoStore(await runPlaidSync({ dryRun }));
  } catch (e) {
    return jsonNoStore({ target: "plaid", error: safeMessage(e) }, { status: 502 });
  }
}
