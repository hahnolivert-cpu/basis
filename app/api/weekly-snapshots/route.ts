import { createServiceClient } from "@/lib/supabase/service";
import { jsonNoStore } from "@/lib/http";
import type { WeeklySnapshot } from "@/lib/types";

export const dynamic = "force-dynamic";

export type WeeklySnapshotsPayload = { snapshots: WeeklySnapshot[]; error?: string };

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ snapshots: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }

  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("weekly_snapshots")
    .select("sunday_date, crypto_cents, equities_cents, cash_cents, total_cents, usd_to_eur, btc_price_usd, source")
    .order("sunday_date", { ascending: true })
    .returns<WeeklySnapshot[]>();

  if (error) {
    return jsonNoStore({ snapshots: [], error: error.message }, { status: 500 });
  }

  // Postgres numerics arrive as strings over the wire; coerce the rate columns
  // so the client can do arithmetic without per-call parsing.
  const snapshots = (data ?? []).map((r) => ({
    ...r,
    usd_to_eur: Number(r.usd_to_eur),
    btc_price_usd: Number(r.btc_price_usd),
  }));

  return jsonNoStore({ snapshots });
}
