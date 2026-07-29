import { jsonNoStore } from "@/lib/http";
import { getDbHoldings, type DbHolding } from "@/lib/holdings";

export const dynamic = "force-dynamic";

export type HoldingsPayload = { holdings: DbHolding[]; source: "db" | "seed"; error?: string };

export async function GET() {
  try {
    const holdings = await getDbHoldings();
    return jsonNoStore({ holdings, source: "db" } satisfies HoldingsPayload);
  } catch (e) {
    // The client falls back to the static seed so the dashboard still renders.
    return jsonNoStore({ holdings: [], source: "seed", error: e instanceof Error ? e.message : String(e) });
  }
}
