import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/http";
import { runAllSyncs } from "@/lib/sync";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET previews every sync without writing.
export async function GET() {
  return jsonNoStore(await runAllSyncs({ dryRun: true }));
}

export async function POST(request: NextRequest) {
  const dryRun = new URL(request.url).searchParams.get("dryRun") === "1";
  const result = await runAllSyncs({ dryRun });
  // 207 distinguishes "some providers synced" from "everything worked".
  const status = result.failed === 0 ? 200 : result.failed === result.results.length ? 502 : 207;
  return jsonNoStore(result, { status });
}
