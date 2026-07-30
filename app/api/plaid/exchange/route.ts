import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/http";
import { exchangePublicToken } from "@/lib/plaid";
import { createServiceClient } from "@/lib/supabase/service";

// Swaps Link's short-lived public_token for a long-lived access_token and
// stores it in plaid_items. The access token is a bearer credential for the
// user's bank data — it lives only in a table with RLS on and no policies, so
// nothing but the service role can read it, and it is never returned here.
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  let body: { public_token?: string; institution?: string };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: "Body must be JSON" }, { status: 400 });
  }

  const publicToken = String(body.public_token ?? "").trim();
  const institution = String(body.institution ?? "").trim();
  if (!publicToken) return jsonNoStore({ error: "public_token is required" }, { status: 400 });
  if (!institution) return jsonNoStore({ error: "institution is required" }, { status: 400 });

  try {
    const { access_token, item_id } = await exchangePublicToken(publicToken);
    const supabase = createServiceClient();

    // Re-linking the same institution should replace its token, not stack up
    // duplicates that would each be synced.
    await supabase.from("plaid_items").delete().eq("institution", institution);
    const { error } = await supabase.from("plaid_items").insert({ institution, access_token, cursor: null });
    if (error) throw new Error(`Could not store the Plaid item: ${error.message}`);

    return jsonNoStore({ institution, item_id, linked: true });
  } catch (e) {
    return jsonNoStore({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}

// Lists linked institutions so the Link page can show what is already connected.
// Deliberately never selects access_token.
export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ items: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from("plaid_items")
    .select("institution, created_at")
    .order("created_at", { ascending: true });
  if (error) return jsonNoStore({ items: [], error: error.message }, { status: 500 });
  return jsonNoStore({ items: data ?? [] });
}
