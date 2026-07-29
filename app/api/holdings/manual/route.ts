import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/http";
import { createServiceClient } from "@/lib/supabase/service";
import { quoteRefFor, SELF_CUSTODY_INSTITUTION } from "@/lib/holdings";
import { getQuotes } from "@/lib/market";

// Manual positions — self-custody assets no provider sync can see, e.g. coins
// on a hardware wallet. They live in their own account, so a provider sync's
// stale-row cleanup can never touch them.
export const dynamic = "force-dynamic";

const SELF_CUSTODY = {
  institution: SELF_CUSTODY_INSTITUTION,
  name: "Hardware wallet",
  portfolio: "personal",
  type: "crypto",
};

type Body = {
  symbol?: string;
  name?: string;
  qty?: number | string;
  costBasis?: number | string;
  assetClass?: string;
  sector?: string | null;
  geo?: string | null;
};

async function selfCustodyAccountId(supabase: ReturnType<typeof createServiceClient>) {
  const { data: existing } = await supabase
    .from("accounts")
    .select("id")
    .eq("institution", SELF_CUSTODY.institution)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data: created, error } = await supabase.from("accounts").insert(SELF_CUSTODY).select("id").single();
  if (error) throw new Error(`Could not create the self-custody account: ${error.message}`);
  return created.id as string;
}

export async function POST(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }

  let body: Body;
  try {
    body = await request.json();
  } catch {
    return jsonNoStore({ error: "Body must be JSON" }, { status: 400 });
  }

  const symbol = String(body.symbol ?? "").trim().toUpperCase();
  const qty = Number(body.qty);
  const costBasis = Number(body.costBasis ?? 0);
  const assetClass = ["Cash", "Equities", "Crypto"].includes(String(body.assetClass)) ? String(body.assetClass) : "Crypto";

  if (!symbol) return jsonNoStore({ error: "symbol is required" }, { status: 400 });
  if (!Number.isFinite(qty) || qty <= 0) return jsonNoStore({ error: "qty must be a positive number" }, { status: 400 });
  if (!Number.isFinite(costBasis) || costBasis < 0) {
    return jsonNoStore({ error: "costBasis must be zero or more" }, { status: 400 });
  }

  try {
    const supabase = createServiceClient();
    const account_id = await selfCustodyAccountId(supabase);

    // Value the position from a live quote where one exists, so it isn't
    // stranded at cost. Falls back to cost basis when the symbol is unknown.
    let valueCents = Math.round(costBasis * 100);
    let pricedFrom: string | null = null;
    const ref = quoteRefFor(symbol, assetClass);
    if (ref) {
      const { quotes } = await getQuotes();
      const px = quotes[symbol]?.price;
      if (px) {
        valueCents = Math.round(qty * px * 100);
        pricedFrom = `live quote ${px}`;
      }
    }

    const { error } = await supabase.from("holdings").upsert(
      {
        account_id,
        symbol,
        name: String(body.name ?? "").trim() || symbol,
        qty,
        cost_basis_cents: Math.round(costBasis * 100),
        value_cents: valueCents,
        asset_class: assetClass,
        sector: body.sector ?? (assetClass === "Crypto" ? "Crypto" : null),
        geo: body.geo ?? (assetClass === "Crypto" ? "Global" : null),
        yield_pct: 0,
        is_manual: true,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,symbol" }
    );
    if (error) throw new Error(error.message);

    return jsonNoStore({ symbol, qty, valueCents, pricedFrom, account: SELF_CUSTODY.name });
  } catch (e) {
    return jsonNoStore({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonNoStore({ error: "SUPABASE_SERVICE_ROLE_KEY not set" }, { status: 503 });
  }
  const symbol = new URL(request.url).searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol) return jsonNoStore({ error: "symbol query parameter is required" }, { status: 400 });

  try {
    const supabase = createServiceClient();
    // Scoped to the self-custody account, not is_manual — seeded provider rows
    // also carry is_manual, so matching on it could delete the wrong LINK.
    const { data: account } = await supabase
      .from("accounts")
      .select("id")
      .eq("institution", SELF_CUSTODY.institution)
      .maybeSingle();
    if (!account?.id) return jsonNoStore({ error: "No self-custody account exists yet" }, { status: 404 });

    const { error, count } = await supabase
      .from("holdings")
      .delete({ count: "exact" })
      .eq("account_id", account.id)
      .eq("symbol", symbol);
    if (error) throw new Error(error.message);
    if (!count) return jsonNoStore({ error: `No manual holding named ${symbol}` }, { status: 404 });
    return jsonNoStore({ deleted: symbol });
  } catch (e) {
    return jsonNoStore({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
