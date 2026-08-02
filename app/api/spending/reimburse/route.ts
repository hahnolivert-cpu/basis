import type { NextRequest } from "next/server";
import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";

// Flips whether a card charge was actually a 976 expense paid personally
// and reimbursed via Brex — no live Brex feed to auto-match against yet
// (see CLAUDE.md), so this is a manual per-transaction toggle.
export const dynamic = "force-dynamic";

export async function PATCH(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  let body: { id?: string; reimbursedBy?: string | null };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: "Body must be JSON" }, { status: 400 });
  }

  const id = String(body.id ?? "").trim();
  if (!id) return jsonNoStore({ error: "id is required" }, { status: 400 });
  const reimbursedBy = body.reimbursedBy ? String(body.reimbursedBy).trim() || null : null;

  try {
    const supabase = createServiceClient();
    const { error, count } = await supabase
      .from("card_spend")
      .update({ reimbursed_by: reimbursedBy }, { count: "exact" })
      .eq("id", id);
    if (error) throw new Error(error.message);
    if (!count) return jsonNoStore({ error: "No transaction with that id" }, { status: 404 });
    return jsonNoStore({ id, reimbursedBy });
  } catch (e) {
    return jsonNoStore({ error: safeMessage(e) }, { status: 500 });
  }
}
