"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { HoldingsPayload } from "@/app/api/holdings/route";

// Holdings change when a sync runs or a manual position is edited, so this
// revalidates on mount/focus rather than polling. SyncButton mutates this key
// after a sync so the dashboard picks up new positions immediately.
export function useHoldings() {
  return useSWR<HoldingsPayload>("/api/holdings", fetcher);
}
