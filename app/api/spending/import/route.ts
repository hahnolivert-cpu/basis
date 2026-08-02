import type { NextRequest } from "next/server";
import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";
import { parseCapitalOneCsv } from "@/lib/spending";

// Imports a bank-issued CSV statement export. Idempotent — upserts on
// external_id, so re-uploading a file (or one with an overlapping date
// range) never duplicates rows.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  let body: { csv?: string };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: "Body must be JSON" }, { status: 400 });
  }

  const csv = body.csv ?? "";
  if (!csv.trim()) return jsonNoStore({ error: "csv is required" }, { status: 400 });

  let parsed: ReturnType<typeof parseCapitalOneCsv>;
  try {
    parsed = parseCapitalOneCsv(csv);
  } catch (e) {
    return jsonNoStore({ error: safeMessage(e) }, { status: 400 });
  }
  if (parsed.length === 0) return jsonNoStore({ imported: 0, skipped: 0, total: 0 });

  try {
    const supabase = createServiceClient();
    const rows = parsed.map((r) => ({
      source: r.source,
      card_last4: r.cardLast4,
      transaction_date: r.transactionDate,
      posted_date: r.postedDate,
      description: r.description,
      category: r.category,
      amount_cents: r.amountCents,
      external_id: r.externalId,
    }));
    const { error, count } = await supabase
      .from("card_spend")
      .upsert(rows, { onConflict: "external_id", ignoreDuplicates: false, count: "exact" });
    if (error) throw new Error(error.message);

    return jsonNoStore({ imported: count ?? rows.length, total: rows.length });
  } catch (e) {
    return jsonNoStore({ error: safeMessage(e) }, { status: 500 });
  }
}
