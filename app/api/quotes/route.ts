import { jsonNoStore } from "@/lib/http";
import { getQuotes } from "@/lib/market";

export const dynamic = "force-dynamic";

// Re-exported so client hooks can keep importing the payload type from here.
export type { Quote, QuotesPayload } from "@/lib/market";

export async function GET() {
  return jsonNoStore(await getQuotes());
}
