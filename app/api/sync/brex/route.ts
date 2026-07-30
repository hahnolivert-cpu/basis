import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/http";
import { runBrexSync } from "@/lib/sync/brex";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET never writes — the "show me what it parsed" path.
export async function GET() {
  try {
    return jsonNoStore(await runBrexSync({ dryRun: true }));
  } catch (e) {
    return jsonNoStore({ target: "brex", error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

export async function POST(request: NextRequest) {
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  try {
    return jsonNoStore(await runBrexSync({ dryRun }));
  } catch (e) {
    return jsonNoStore({ target: "brex", error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
