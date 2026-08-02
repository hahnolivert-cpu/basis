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
    // A single select caps at Supabase's default 1000-row limit — with
    // 2000+ rows imported, that silently dropped everything older than
    // the newest 1000 (ordered transaction_date desc). Page through with
    // .range() instead of assuming one request returns everything.
    const PAGE = 1000;
    const data: Row[] = [];
    for (let from = 0; ; from += PAGE) {
      const { data: page, error } = await supabase
        .from("card_spend")
        .select("id, source, card_last4, transaction_date, description, category, amount_cents, reimbursed_by")
        .order("transaction_date", { ascending: false })
        .range(from, from + PAGE - 1)
        .returns<Row[]>();
      if (error) throw new Error(error.message);
      if (!page || page.length === 0) break;
      data.push(...page);
      if (page.length < PAGE) break;
    }

    const rows: SpendRow[] = data.map((r) => ({
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
