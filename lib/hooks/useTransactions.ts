"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { TransactionRow } from "@/app/api/transactions/route";

// Buy-transaction history changes only when a sync runs, so no polling —
// revalidate on mount/focus like the other slow-moving data hooks.
// `enabled: false` skips the fetch entirely (SWR's null-key convention) —
// the demo page has no session and would just get a 401 back.
export function useTransactions({ enabled = true }: { enabled?: boolean } = {}) {
  return useSWR<{ transactions: TransactionRow[]; error?: string }>(enabled ? "/api/transactions" : null, fetcher);
}
