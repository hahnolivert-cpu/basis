import { jsonNoStore, safeMessage } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";
import type { SpendRow } from "@/lib/spending";

export const dynamic = "force-dynamic";

type Row = {
  id: string;
  source: string;
  card_last4: string;
  transaction_date: string;
  description: string;
  category: string;
  amount_cents: number;
  reimbursed_by: string | null;
};

export type SpendingPayload = { rows: SpendRow[]; error?: string };

export async function GET() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ rows: [], error: "SUPABASE_SERVICE_ROLE_KEY not set" } satisfies SpendingPayload);
  }
  try {
    const supabase = createServiceClient();
    const { data, error } = await supabase
      .from("card_spend")
      .select("id, source, card_last4, transaction_date, description, category, amount_cents, reimbursed_by")
      .order("transaction_date", { ascending: false })
      .returns<Row[]>();
    if (error) throw new Error(error.message);

    const rows: SpendRow[] = (data ?? []).map((r) => ({
      id: r.id,
      source: r.source,
      cardLast4: r.card_last4,
      date: r.transaction_date,
      description: r.description,
      category: r.category,
      amountCents: r.amount_cents,
      reimbursedBy: r.reimbursed_by,
    }));
    return jsonNoStore({ rows } satisfies SpendingPayload);
  } catch (e) {
    return jsonNoStore({ rows: [], error: safeMessage(e) } satisfies SpendingPayload, { status: 500 });
  }
}
