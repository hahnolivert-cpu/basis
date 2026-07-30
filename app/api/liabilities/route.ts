import type { NextRequest } from "next/server";
import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";

// Debts. Previously a hardcoded DEBTS constant in lib/data.ts that never moved
// as balances changed; now editable so net worth reflects reality.
export const dynamic = "force-dynamic";

export type Liability = { id: string; name: string; amount_cents: number };
export type LiabilitiesPayload = { liabilities: Liability[]; totalCents: number; error?: string };

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ liabilities: [], totalCents: 0, error: "SUPABASE_SERVICE_ROLE_KEY not set" });
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("liabilities")
      .select("id, name, amount_cents")
      .order("amount_cents", { ascending: false })
      .returns<Liability[]>();
    if (error) throw new Error(error.message);
    const liabilities = data ?? [];
    return jsonNoStore({
      liabilities,
      totalCents: liabilities.reduce((s, l) => s + Number(l.amount_cents), 0),
    } satisfies LiabilitiesPayload);
  } catch (e) {
    return jsonNoStore({ liabilities: [], totalCents: 0, error: safeMessage(e) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }
  let body: { id?: string; name?: string; amount?: number | string };
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: "Body must be JSON" }, { status: 400 });
  }

  const name = String(body.name ?? "").trim();
  const amount = Number(body.amount);
  if (!name) return jsonNoStore({ error: "name is required" }, { status: 400 });
  if (!Number.isFinite(amount) || amount < 0) {
    return jsonNoStore({ error: "amount must be zero or more" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const row = { name, amount_cents: Math.round(amount * 100), updated_at: new Date().toISOString() };
    const { error } = body.id
      ? await supabase.from("liabilities").update(row).eq("id", body.id)
      : await supabase.from("liabilities").insert(row);
    if (error) throw new Error(error.message);
    return jsonNoStore({ name, amountCents: row.amount_cents });
  } catch (e) {
    return jsonNoStore({ error: safeMessage(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }
  const id = new URL(request.url).searchParams.get("id");
  if (!id) return jsonNoStore({ error: "id query parameter is required" }, { status: 400 });
  try {
    const supabase = createServiceClient();
    const { error, count } = await supabase.from("liabilities").delete({ count: "exact" }).eq("id", id);
    if (error) throw new Error(error.message);
    if (!count) return jsonNoStore({ error: "No liability with that id" }, { status: 404 });
    return jsonNoStore({ deleted: id });
  } catch (e) {
    return jsonNoStore({ error: safeMessage(e) }, { status: 500 });
  }
}
