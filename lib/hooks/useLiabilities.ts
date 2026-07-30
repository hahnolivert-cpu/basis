"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { LiabilitiesPayload } from "@/app/api/liabilities/route";

// Debts change rarely, so revalidate on mount/focus rather than polling.
export function useLiabilities() {
  return useSWR<LiabilitiesPayload>("/api/liabilities", fetcher);
}
