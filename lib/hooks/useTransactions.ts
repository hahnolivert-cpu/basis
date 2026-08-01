"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { TransactionRow } from "@/app/api/transactions/route";

// Buy/sell transaction history changes only when a sync runs, so no polling —
// revalidate on mount/focus like the other slow-moving data hooks.
export function useTransactions() {
  return useSWR<{ transactions: TransactionRow[]; error?: string }>("/api/transactions", fetcher);
}
