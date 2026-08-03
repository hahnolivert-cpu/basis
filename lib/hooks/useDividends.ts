"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { DividendsPayload } from "@/app/api/dividends/route";

// The API only backfills a couple of stale symbols per request (Polygon's
// free tier is ~5 req/min, 2 calls/symbol) — so with more holdings than that,
// a single mount/focus fetch leaves most yields unfilled for the day. Poll
// like useQuotes so an open tab keeps making that catch-up request until
// every symbol is warm; once cached for today, each poll is just a cheap
// Supabase read with no Polygon calls.
export function useDividends() {
  return useSWR<DividendsPayload>("/api/dividends", fetcher, { refreshInterval: 60_000 });
}
