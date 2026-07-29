"use client";

import useSWR from "swr";
import { fetcher } from "./fetcher";
import type { DividendsPayload } from "@/app/api/dividends/route";

// Dividend yields only change daily, so this just revalidates on mount/focus
// rather than polling like useQuotes.
export function useDividends() {
  return useSWR<DividendsPayload>("/api/dividends", fetcher);
}
