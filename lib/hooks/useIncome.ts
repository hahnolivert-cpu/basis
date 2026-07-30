"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { IncomeTransaction } from "@/app/api/dividend-income/route";

// Dividend/interest/withholding-tax history changes only when a sync runs,
// so no polling — revalidate on mount/focus like the other slow-moving data
// hooks.
export function useIncome() {
  return useSWR<{ transactions: IncomeTransaction[]; error?: string }>("/api/dividend-income", fetcher);
}
