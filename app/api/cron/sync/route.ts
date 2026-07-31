import { NextResponse, type NextRequest } from "next/server";
import { runAllSyncs } from "@/lib/sync";

// Scheduled by vercel.json, twice daily. Not covered by the auth middleware
// (see middleware.ts) — it authenticates on CRON_SECRET instead, same as the
// weekly-snapshot cron. Runs in-process rather than calling /api/sync over
// HTTP, since that route sits behind the session middleware and a scheduled
// run carries no cookie.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (secret) {
    if (request.headers.get("authorization") !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else if (process.env.NODE_ENV === "production") {
    // Fail closed rather than leave a public write endpoint exposed.
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  const result = await runAllSyncs();
  const status = result.failed === 0 ? 200 : result.failed === result.results.length ? 502 : 207;
  return NextResponse.json(result, { status });
}
