"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { EarningsPayload } from "@/app/api/earnings/route";

// Earnings dates/estimates and historical actual-vs-estimate results change
// at most daily (Finnhub's own calendar and earnings-surprise data don't
// update intraday), so this just revalidates on mount/focus.
export function useEarnings() {
  return useSWR<EarningsPayload>("/api/earnings", fetcher);
}
