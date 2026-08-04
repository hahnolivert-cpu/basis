"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { EarningsPayload } from "@/app/api/earnings/route";

// The API only backfills a couple of stale symbols per request (Finnhub +
// Polygon calls per symbol add up), so a single mount/focus fetch can leave
// most symbols on a stale cache entry for a long time — same reasoning as
// useDividends. Poll so an open tab catches up on its own; once every
// symbol is cached for today, each poll is just a cheap Supabase read.
export function useEarnings() {
  return useSWR<EarningsPayload>("/api/earnings", fetcher, { refreshInterval: 60_000 });
}
