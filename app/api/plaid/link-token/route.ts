import type { NextRequest } from "next/server";
import { jsonNoStore } from "@/lib/http";
import { createLinkToken, type LinkProduct } from "@/lib/plaid";

export const dynamic = "force-dynamic";

const ALLOWED: LinkProduct[] = ["transactions", "investments"];

export async function POST(request: NextRequest) {
  const requested = new URL(request.url).searchParams.get("products") ?? "transactions";
  const products = requested.split(",").filter((p): p is LinkProduct => ALLOWED.includes(p as LinkProduct));
  if (!products.length) {
    return jsonNoStore({ error: `products must be one of ${ALLOWED.join(", ")}` }, { status: 400 });
  }

  try {
    const { link_token, expiration } = await createLinkToken(products);
    return jsonNoStore({ link_token, expiration, products });
  } catch (e) {
    return jsonNoStore({ error: e instanceof Error ? e.message : String(e) }, { status: 502 });
  }
}
